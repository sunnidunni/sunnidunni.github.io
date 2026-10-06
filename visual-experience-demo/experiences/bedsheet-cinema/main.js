// Bedsheet Cinema: the night's photos projected one at a time onto a bedsheet pinned to a beam
// in front of a plank wall. The sheet is a verlet cloth; a slide projector on a chair in front of
// you, low and to the right, lights it by projective texturing, with a shadow map for its folds.
// Draws only while the cloth moves or the draft is on, and never off screen.
import { Cloth } from './cloth.js';

const ROOT = './';
const LAYER = 384; // thumbnail texture size; the current slide shows its full file once decoded
const SHADOW = 512; // the projector's depth map
const EYE_DIST = 3.3; // metres from the sheet to the viewer
const LENS = [.84, -.8, 1.35]; // the projector's lens: where it sits in the frame (-1 to 1 across and up), metres ahead of you
const MOTES = 64;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
if (!gl) { document.body.append('This work needs WebGL 2.'); throw new Error('WebGL 2 unavailable'); }

let W = 1, H = 1, live = false, raf = 0, last = 0, acc = 0, time = 0;
let cloth = null, sheet = null, view = null, grab = null, down = null;

// The platform feed tells works when they are off screen; standalone, the work simply runs.
let hostActive = true;
const running = () => hostActive && !document.hidden;
addEventListener('message', (e) => {
  if (e.source === parent && e.data?.type === 'platform:visibility') { hostActive = !!e.data.active; wake(); }
});
document.addEventListener('visibilitychange', wake);
if (parent !== window) parent.postMessage({ type: 'platform:hello' }, '*');

// ---------------------------------------------------------------------------
// Shaders. World units are metres: the plank wall is z = 0, the floor y = 0, the viewer at +z.
// The projector faces the wall square on, with its lens shifted so the picture lands centred on
// the sheet; tangent coordinates (x / -z from the lens) locate a ray on the slide.
// ---------------------------------------------------------------------------
const LIGHT = `
uniform vec3 uEye, uProj, uAxis, uLamp;
uniform vec4 uGate;  // picture centre in tangent coordinates, half size of the square gate, throw² to the centre
uniform vec4 uOptic; // photo half size within the gate, focus distance, defocus of the whole slide (mip levels)
uniform vec2 uJiggle, uRes;
uniform vec4 uSheet; // the sheet's rest rectangle on the wall: x0, y0, x1, y1
uniform float uSheetZ, uLayer, uFull, uHaze, uTime, uDust;
uniform mediump sampler2DArray uThumbs;
uniform mediump sampler2D uPhoto;
uniform highp sampler2DShadow uShadow;
uniform mat4 uShadowVP;

float hash(vec2 p) { vec3 q = fract(p.xyx * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }

// The slide in linear light, blurred by the lens when out of focus (blur in mip levels).
vec3 slide(vec2 uv, float blur) {
  return uFull > .5 ? texture(uPhoto, uv, blur).rgb : texture(uThumbs, vec3(uv, uLayer), blur).rgb;
}
// Light from the projector arriving at X, before the surface turns it by n·l: the slide's colour
// where its ray lands, a faint leak around the photo inside the gate and a glow past its edge,
// falling off toward the corners and with distance (1/d²).
vec3 beam(vec3 X, float blur) {
  vec3 q = X - uProj;
  vec2 g = (q.xy / -q.z - uGate.xy - uJiggle) / uGate.z, ph = g / uOptic.xy;
  float e = .004 + blur * .01;
  float photo = smoothstep(1. + e, 1. - e, max(abs(ph.x), abs(ph.y)));
  float leak = smoothstep(1.03, .93, max(abs(g.x), abs(g.y))) * .008;
  vec3 c = slide(vec2(.5 + .5 * ph.x, .5 - .5 * ph.y), blur) * photo + leak * (1. - photo);
  // past the picture's edge, the lens's glare and the cotton's scatter carry a little of it on
  float past = length(max(abs(ph) - 1., 0.) * uOptic.xy) * uGate.z * uOptic.z; // metres, at the sheet
  vec3 rim = textureLod(uThumbs, vec3(clamp(vec2(.5 + .5 * ph.x, .5 - .5 * ph.y), 0., 1.), uLayer), 4.).rgb;
  c += rim * (.12 * exp(-past / .045) + .025 * exp(-past / .13)) * (1. - photo);
  float d2 = dot(q, q), cosA = dot(q, uAxis) * inversesqrt(d2);
  return uLamp * c * cosA * cosA * uGate.w / d2;
}
// How far a surface at X sits from the plane the lens is focused on, as blur.
float defocus(vec3 X) { return uOptic.w + abs(uProj.z - X.z - uOptic.z) * 4.5; }
// 1 where the projector sees X, 0 where the sheet stands in its way. A projector's small lens
// casts crisp shadows: one filtered tap is soft enough.
float lit(vec3 X) {
  vec4 c = uShadowVP * vec4(X, 1);
  return textureLod(uShadow, c.xyz / c.w * .5 + .5, 0.);
}
// Dust in the air scatters some of the beam toward the eye: thickest near the lens, where the light
// is strongest, and along the beam's axis, thinning softly to its sides, and slowly drifting. The
// light along the eye ray is integrated exactly for a point source (∫ dt / d²); four samples, one
// where the ray passes nearest the lens, weigh the dust it meets.
void clip(float a, float b, inout float t0, inout float t1) {
  if (abs(b) < 1e-6) { if (a < 0.) t1 = -1.; } else if (b > 0.) t0 = max(t0, -a / b); else t1 = min(t1, -a / b);
}
vec3 haze(vec3 X) {
  vec3 r = X - uEye;
  float t1 = length(r);
  r /= t1;
  t1 = min(t1, (uSheetZ - uEye.z) / r.z);
  vec3 o = uEye - uProj;
  vec2 c = uGate.xy + uJiggle, lo = c - uGate.z * uOptic.xy * 1.5, hi = c + uGate.z * uOptic.xy * 1.5;
  float t0 = 0.;
  clip(o.x + lo.x * o.z, r.x + lo.x * r.z, t0, t1);
  clip(-o.x - hi.x * o.z, -r.x - hi.x * r.z, t0, t1);
  clip(o.y + lo.y * o.z, r.y + lo.y * r.z, t0, t1);
  clip(-o.y - hi.y * o.z, -r.y - hi.y * r.z, t0, t1);
  if (t1 <= t0) return vec3(0);
  float b = dot(o, r), h = sqrt(max(dot(o, o) - b * b, .0016)); // no closer than the lens's own size
  float I = (atan((t1 + b) / h) - atan((t0 + b) / h)) / h, tn = clamp(-b, t0, t1), dust = 0., sum = 0.;
  for (int i = 0; i < 4; i++) {
    vec3 q = o + r * (i == 0 ? tn : mix(t0, t1, (float(i) - .5) / 3.));
    float d2 = max(dot(q, q), .0016);
    vec2 g = ((q.xy / -q.z - c) / uGate.z) / uOptic.xy;
    float n = .6 * noise(vec2(q.x * 2.6 - q.z * 1.1, q.y * 2.6) + uTime * vec2(.05, .03)) + .4 * noise(vec2(q.x * 6.1, q.y * 6.1 + q.z * 2.3) - uTime * .07);
    dust += exp(-1.7 * dot(g, g)) * (.15 + 1.7 * n) * (.25 + 3.6 * exp(-sqrt(d2) / .45)) / d2;
    sum += 1. / d2;
  }
  vec3 q = o + r * tn;
  vec2 ph = ((q.xy / -q.z - c) / uGate.z) / uOptic.xy;
  vec3 tint = textureLod(uThumbs, vec3(clamp(vec2(.5 + .5 * ph.x, .5 - .5 * ph.y), 0., 1.), uLayer), 5.5).rgb;
  return uLamp * tint * I * dust / sum * uGate.w * uHaze * uDust;
}
// Exposure, a lens's darker corners, display gamma and dither.
vec4 finish(vec3 c) {
  vec2 v = (gl_FragCoord.xy / uRes - .5) * vec2(uRes.x / uRes.y, 1);
  c *= 1. - .5 * smoothstep(.35, 1.1, length(v) / length(vec2(uRes.x / uRes.y, 1) * .5) * 1.1);
  c = 1. - exp(-c * 1.7);
  return vec4(pow(c, vec3(1. / 2.2)) + (hash(gl_FragCoord.xy) - .5) / 255., 1);
}`;

// The sheet: cotton, a little translucent, with the creases of being stored folded and a hem.
const clothProgram = program(`
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
uniform mat4 uVP; uniform float uLayer; uniform vec3 uLamp; uniform mediump sampler2DArray uThumbs;
out vec3 vP, vN; out vec2 vUV; flat out vec3 vAvg;
void main() {
  vP = aPos; vN = aNormal; vUV = aUV; gl_Position = uVP * vec4(aPos, 1);
  vAvg = uLamp * textureLod(uThumbs, vec3(.5, .5, uLayer), 12.).rgb; // the slide's average colour
}`, `
${LIGHT}
uniform vec2 uSize; // the sheet in metres
in vec3 vP, vN; in vec2 vUV; flat in vec3 vAvg;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  // folded in three and in four for the cupboard: ridges and valleys, a shade darker along each
  // fold (ridge at the first third and the middle; valleys at the second third and the quarters)
  float fw = fwidth(vUV.x) + fwidth(vUV.y), w2 = max(6e-6, fw * fw);
  vec2 pitch = uSize / vec2(3, 4), d = vUV - pitch * clamp(floor(vUV / pitch + .5), vec2(1), vec2(2, 3));
  vec2 c = vec2(vUV.x < uSize.x * .5 ? .0022 : -.0022, abs(vUV.y - uSize.y * .5) < pitch.y * .5 ? .0022 : -.0022) * exp(-d * d / 4.9e-5);
  float gu = -2. * d.x / 4.9e-5 * c.x, gv = -2. * d.y / 4.9e-5 * c.y, line = exp(-d.x * d.x / w2) + exp(-d.y * d.y / w2);
  vec3 dp1 = dFdx(vP), dp2 = dFdy(vP); vec2 du1 = dFdx(vUV), du2 = dFdy(vUV);
  vec3 p2 = cross(dp2, n), p1 = cross(n, dp1), T = p2 * du1.x + p1 * du2.x, B = p2 * du1.y + p1 * du2.y;
  float s = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  n = normalize(n - (T * gu + B * gv) * s);
  // weave and slub, faded out where a pixel covers many threads
  float weave = (.5 * noise(vUV * vec2(7., 150.)) + .5 * noise(vUV * vec2(150., 7.))) * clamp(1.4 - fw * 250., 0., 1.);
  // the hem: doubled cloth along every edge, with the step where it ends
  float e = min(min(vUV.x, uSize.x - vUV.x), min(vUV.y, uSize.y - vUV.y));
  float hem = 1. - .16 * smoothstep(.0016 + fw, 0., abs(e - .026)) - .3 * smoothstep(.003 + fw, 0., e);
  vec3 albedo = vec3(.86, .845, .81) * (1. - .06 * weave) * (1. - .1 * min(line, 1.) * min(1., .0025 / fw)) * hem;
  vec3 N = dot(n, uEye - vP) < 0. ? -n : n; // the side in view
  float ndl = dot(N, normalize(uProj - vP));
  float seen = lit(vP + N * sign(ndl) * (.004 + .01 * (1. - abs(ndl)))); // offset more at grazing light
  vec3 E = beam(vP, defocus(vP)) * (seen + (1. - seen) * .32); // a layer of cotton in front still passes some
  float through = e < .026 ? .16 : .38; // light on the far side shows through the weave
  // what the lit cloth and the room give back to it keeps its folds from going black
  o = finish(albedo * (E * (max(ndl, 0.) + through * max(-ndl, 0.)) + vAvg * .015 + vec3(.0045, .0035, .0025)) + haze(vP));
}`);

// The cabin: plank wall, floorboards, the beam the sheet is pinned to, and three clothespins.
const roomProgram = program(`
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aMat;
uniform mat4 uVP;
uniform float uLayer; uniform vec3 uLamp; uniform mediump sampler2DArray uThumbs;
out vec3 vP; flat out vec3 vN, vAvg; flat out int vMat;
void main() {
  vP = aPos; vN = aNormal; vMat = int(aMat); gl_Position = uVP * vec4(aPos, 1);
  vAvg = uLamp * textureLod(uThumbs, vec3(.5, .5, uLayer), 12.).rgb; // the slide's average colour
}`, `
${LIGHT}
in vec3 vP; flat in vec3 vN, vAvg; flat in int vMat;
out vec4 o;
// Boards of width w across p.x, with their grain along p.y and a dark seam between them.
vec3 boards(vec2 p, float w, vec3 tint) {
  float i = floor(p.x / w), f = fract(p.x / w), aa = fwidth(p.x) / w;
  float grain = .6 * noise(vec2(p.x * 55. + i * 17., p.y * 1.3 + i * 5.)) + .4 * noise(vec2(p.x * 240. + i * 3., p.y * 7.));
  float seam = smoothstep(0., .02 + aa, f) * smoothstep(1., .98 - aa, f);
  return tint * (.7 + .55 * hash(vec2(i, 4.))) * (.75 + .45 * grain) * (.3 + .7 * seam);
}
void main() {
  vec3 n = vN, alb;
  if (vMat == 0) alb = boards(vP.xy, .145, vec3(.2, .125, .075));
  else if (vMat == 1) alb = boards(vP.xz, .115, vec3(.14, .09, .055));
  else if (vMat == 2) alb = boards(vP.yx, 1., vec3(.17, .105, .06));
  else alb = vec3(.72, .6, .44);
  vec3 E = beam(vP, defocus(vP)) * lit(vP + n * .003) * max(dot(n, normalize(uProj - vP)), 0.);
  // the lit sheet glows: through the cloth onto the wall close behind it, off it onto the floor
  vec2 d = max(uSheet.xy - vP.xy, vP.xy - uSheet.zw);
  float away = length(max(d, 0.));
  float glow = vMat == 1 ? .1 * exp(-vP.z / 1.1 - max(abs(vP.x) - (uSheet.z - uSheet.x) * .5, 0.) / .5)
                         : .13 * exp(-away / .1) + .04 * exp(-away / .5);
  o = finish(alb * (E + vAvg * vec3(1.1, .95, .8) * glow + vec3(.008, .006, .0042)) + haze(vP));
}`);

// The sheet seen from the projector, for its shadow.
const shadowProgram = program(`
layout(location = 0) in vec3 aPos;
uniform mat4 uShadowVP;
void main() { gl_Position = uShadowVP * vec4(aPos, 1); }`, `
out vec4 o;
void main() { o = vec4(0); }`);

// Dust in the beam: each mote catches the colour of the picture where it floats and glints as it turns.
const moteProgram = program(`
layout(location = 0) in vec4 aMote; // position, fade
uniform mat4 uVP; uniform vec3 uProj, uLamp; uniform vec4 uGate, uOptic; uniform vec2 uJiggle, uRes;
uniform float uLayer, uTime, uTan, uFocus, uDust;
uniform mediump sampler2DArray uThumbs;
out vec3 vCol;
void main() {
  vec3 q = aMote.xyz - uProj;
  vec2 ph = ((q.xy / -q.z - uGate.xy - uJiggle) / uGate.z) / uOptic.xy;
  float photo = smoothstep(1.02, .94, max(abs(ph.x), abs(ph.y)));
  vec3 img = textureLod(uThumbs, vec3(.5 + .5 * ph.x, .5 - .5 * ph.y, uLayer), 1.5).rgb;
  float id = float(gl_VertexID), glint = pow(.5 + .5 * sin(uTime * (.6 + fract(id * .618) * 1.7) + id * 2.4), 10.);
  vec4 c = uVP * vec4(aMote.xyz, 1);
  // sharp at the sheet, where the eye is focused; nearer motes blur into larger, fainter discs
  float px = uRes.y / (2. * uTan), size = max(2.2, .0018 * px / c.w + abs(1. / c.w - 1. / uFocus) * px * .006);
  gl_PointSize = size;
  gl_Position = c;
  vCol = uLamp * img * photo * uGate.w / max(dot(q, q), .06) * (.12 + glint) * aMote.w * uDust * 3. * min(1., 8. / (size * size));
}`, `
in vec3 vCol;
out vec4 o;
void main() { vec2 p = gl_PointCoord * 2. - 1.; float a = max(0., 1. - dot(p, p)); o = vec4(vCol * a * a, 0); }`);

// The lens, seen from behind the projector: a warm point where the beam starts, and its flare.
const glareProgram = program(`
uniform vec2 uAt, uRes; uniform float uSize;
out vec2 vP;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.;
  vP = c * uSize;
  gl_Position = vec4(uAt + c * uSize * 2. / uRes, 0, 1);
}`, `
uniform vec3 uGlare; uniform float uScale;
in vec2 vP;
out vec4 o;
void main() {
  vec2 p = vP / uScale; // CSS pixels from the lens
  float r2 = dot(p, p), disc = smoothstep(30., 12., r2); // the lens glass, lit from within
  float bloom = .3 * exp(-r2 / 160.) + .09 / (1. + r2 / 1100.), streak = .045 * exp(-p.y * p.y / 3. - abs(p.x) / 80.);
  o = vec4(uGlare * (disc * vec3(1.5, 1.35, 1.15) + (bloom + streak) * vec3(1, .78, .5)), 0);
}`);

function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, `#version 300 es\nprecision highp float;\n${src}`);
    gl.compileShader(sh);
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getAttachedShaders(p).map((sh) => gl.getShaderInfoLog(sh)).join('\n'));
  const u = {};
  for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) { const { name } = gl.getActiveUniform(p, i); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// ---------------------------------------------------------------------------
// Buffers and textures. Units: 0 every thumbnail, 1 the current slide's full file, 2 the shadow.
// ---------------------------------------------------------------------------
const attrib = (loc, n, stride = 0, offset = 0) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, offset); };
const [surfBuf, uvBuf, idxBuf, roomBuf, moteBuf] = Array.from({ length: 5 }, () => gl.createBuffer());
const clothVao = gl.createVertexArray(), roomVao = gl.createVertexArray(), moteVao = gl.createVertexArray();
gl.bindVertexArray(clothVao);
gl.bindBuffer(gl.ARRAY_BUFFER, surfBuf); attrib(0, 3, 24, 0); attrib(1, 3, 24, 12); // position, normal
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); attrib(2, 2);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
gl.bindVertexArray(roomVao);
gl.bindBuffer(gl.ARRAY_BUFFER, roomBuf); attrib(0, 3, 28, 0); attrib(1, 3, 28, 12); attrib(2, 1, 28, 24);
gl.bindVertexArray(moteVao);
gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf); attrib(0, 4);
gl.bindVertexArray(null);

const texture = (unit, target) => {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, t);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(target, k, v);
  return t;
};
texture(1, gl.TEXTURE_2D);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
const shadowTex = texture(2, gl.TEXTURE_2D);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, SHADOW, SHADOW);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
const shadowFbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
gl.drawBuffers([gl.NONE]);
gl.readBuffer(gl.NONE);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
texture(0, gl.TEXTURE_2D_ARRAY);
for (const { p, u } of [clothProgram, roomProgram, moteProgram]) {
  gl.useProgram(p);
  for (const [name, unit] of [['uThumbs', 0], ['uPhoto', 1], ['uShadow', 2]]) if (u[name]) gl.uniform1i(u[name], unit);
}

// ---------------------------------------------------------------------------
// Photographs: every thumbnail up front, one texture layer each (stretched square; the
// projector restores their shape), in sRGB so the lens blurs them in linear light.
// ---------------------------------------------------------------------------
const photos = (await (await fetch(`${ROOT}photos.json`)).json()).photos.map((p) => ({ ...p, aspect: p.width / p.height, thumb: ROOT + p.thumb, full: ROOT + p.src }));
const P = photos.length;
gl.activeTexture(gl.TEXTURE0);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(LAYER)) + 1, gl.SRGB8_ALPHA8, LAYER, LAYER, P);
const scratch = Object.assign(document.createElement('canvas'), { width: LAYER, height: LAYER }).getContext('2d');
let thumbs = 0;
const loaded = Promise.all(photos.map(async (p, i) => {
  try {
    // decoded and scaled off the main thread where the browser supports it
    let img = await createImageBitmap(await (await fetch(p.thumb)).blob(), { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
    if (img.width !== LAYER || img.height !== LAYER) { scratch.drawImage(img, 0, 0, LAYER, LAYER); img = scratch.canvas; }
    gl.activeTexture(gl.TEXTURE0);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    thumbs++;
  } catch (err) { console.warn('Missing photo', p.thumb, err); }
})).then(() => {
  gl.activeTexture(gl.TEXTURE0);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  document.body.dataset.loaded = String(thumbs);
});

// The slide in the gate shows its full file once decoded; the next one is fetched ahead.
let cur = 0, fullFor = -1;
const fulls = new Map();
const fetchFull = (i) => {
  if (!fulls.has(i)) fulls.set(i, fetch(photos[i].full).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null));
  return fulls.get(i);
};
function wantFull(i) {
  const next = (i + 1) % P, prev = (i + P - 1) % P, pending = fetchFull(i);
  pending.then((img) => {
    if (!img || cur !== i || fullFor === i || fulls.get(i) !== pending) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    fullFor = i;
    wake();
  });
  fetchFull(next);
  for (const [j, f] of fulls) if (j !== i && j !== next && j !== prev) { fulls.delete(j); f.then((b) => b?.close()); }
}

// ---------------------------------------------------------------------------
// The room, the sheet and the projector, framed for the window's shape
// ---------------------------------------------------------------------------
let roomCount = 0, surface = null;
function build(portrait) {
  // a landscape sheet on wide screens, hung portrait when the screen is tall
  const [w, h, nx, ny, top, gate] = portrait ? [1.6, 2.15, 31, 41, 2.55, 1.8] : [2.3, 1.8, 45, 35, 2.25, 2];
  const z = .205, beamY = top - .03;
  grab = down = null; // a sheet rehung mid-drag is no longer in anyone's hand
  calm = reduced ? 99 : 0;
  canvas.classList.remove('is-holding');
  cloth = new Cloth({ nx, ny, width: w, height: h, top, z, beamY });
  sheet = { portrait, w, h, top, z, gate, cy: top - h / 2 - (portrait ? .03 : .06) };
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, cloth.uv, gl.STATIC_DRAW);
  surface = new Float32Array(cloth.n * 6);
  gl.bindBuffer(gl.ARRAY_BUFFER, surfBuf); gl.bufferData(gl.ARRAY_BUFFER, surface.byteLength, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(clothVao); // the element buffer belongs to the vertex array
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cloth.index, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const v = [], quad = (a, b, c, d, n, m) => { for (const p of [a, b, c, a, c, d]) v.push(...p, ...n, m); };
  quad([-9, 0, 0], [9, 0, 0], [9, 6, 0], [-9, 6, 0], [0, 0, 1], 0); // plank wall
  quad([-9, 0, 9], [9, 0, 9], [9, 0, 0], [-9, 0, 0], [0, 1, 0], 1); // floor
  const bz = z - .005, b1 = top + .12; // the beam: its face and underside
  quad([-9, beamY, bz], [9, beamY, bz], [9, b1, bz], [-9, b1, bz], [0, 0, 1], 2);
  quad([-9, beamY, 0], [9, beamY, 0], [9, beamY, bz], [-9, beamY, bz], [0, -1, 0], 2);
  for (const k of cloth.pins) { // a clothespin over each pin
    const x = cloth.p[k * 3], x0 = x - .008, x1 = x + .008, y0 = top - .045, y1 = top + .035, z0 = z + .002, z1 = z + .02;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 3);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 3);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 3);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], 3);
  }
  roomCount = v.length / 7;
  gl.bindBuffer(gl.ARRAY_BUFFER, roomBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
}

const frustum = (l, r, b, t, n, f) => new Float32Array([2 * n / (r - l), 0, 0, 0, 0, 2 * n / (t - b), 0, 0, (r + l) / (r - l), (t + b) / (t - b), -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0]);
const from = (m, v) => { for (let r = 0; r < 4; r++) m[12 + r] -= m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2]; return m; }; // m × translate(-v)

function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5); // a heavy full-screen shader
  W = canvas.width = Math.round(innerWidth * dpr);
  H = canvas.height = Math.round(innerHeight * dpr);
  const portrait = innerHeight > innerWidth * 1.1, fresh = !sheet || sheet.portrait !== portrait;
  if (fresh) build(portrait);
  // A level camera at a seated eye height. Wide screens fit the whole sheet and its beam; on a tall
  // screen the sheet's width fills the screen, with the beam just inside the top.
  const s = sheet, aspect = W / H, near = .1;
  let tan, eyeY;
  if (s.portrait) {
    tan = Math.max(s.w * 1.02 / 2 / EYE_DIST / aspect, (s.h + .4) / 2 / EYE_DIST);
    eyeY = s.top + .2 - tan * EYE_DIST;
  } else {
    eyeY = s.top - s.h / 2 - .05;
    tan = Math.max((s.top + .2 - eyeY) / EYE_DIST, (eyeY - s.top + s.h + .14) / EYE_DIST, s.w * 1.16 / 2 / EYE_DIST / aspect);
  }
  const eye = [0, eyeY, s.z + EYE_DIST];
  const vp = from(frustum(-tan * aspect * near, tan * aspect * near, -tan * near, tan * near, near, 30), eye);
  // The projector sits on a chair in front of you, low and to the right, its lens just inside the
  // frame; it faces the wall square on, its lens shifted to centre the picture on the sheet.
  const proj = [LENS[0] * tan * aspect * LENS[2], eyeY + LENS[1] * tan * LENS[2], eye[2] - LENS[2]], throwZ = proj[2] - s.z;
  const gc = [-proj[0] / throwZ, (s.cy - proj[1]) / throwZ], half = s.gate / 2 / throwZ, m = half * 1.08;
  const toC = [-proj[0], s.cy - proj[1], s.z - proj[2]], d = Math.hypot(...toC);
  const shadowVP = from(frustum(gc[0] - m, gc[0] + m, gc[1] - m, gc[1] + m, 1, 12), proj);
  view = { eye, vp, tan, aspect, proj, gc, half, throwZ, shadowVP, axis: toC.map((c) => c / d), d0: d * d };
  if (fresh) for (let i = 0; i < MOTES; i++) seedMote(i, rand() * 12);
  wake();
}

// ---------------------------------------------------------------------------
// The projector: a halogen lamp that warms up, a carousel that drops the light while it turns,
// and a lens that pulls each new slide into focus. Springs give the focus and the slide's
// settle in the gate their small overshoot.
// ---------------------------------------------------------------------------
const HAZE = .0022; // how much of the beam the dusty air scatters toward the eye
let warm = -1, shutter = 1, change = null, queued = null, gustT = 9, lampRGB = [0, 0, 0], glareRGB = [0, 0, 0], dustK = 0;
let calm = reduced ? 99 : 0; // frames the cloth has been at rest; under reduced motion it starts so
const focus = { x: 0, v: 0, w: 1, z: 1 }, jig = { x: 0, v: 0, w: 2 * Math.PI * 13, z: .16 };
const spring = (s, dt) => { s.v -= (s.w * s.w * s.x + 2 * s.z * s.w * s.v) * dt; s.x += s.v * dt; };

const ease = (a, b, t) => { const k = Math.min(Math.max((t - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };
// The lamp strikes: the filament catches with a flicker and glows in the lens first, a deep orange;
// then the light swells to warm white, and the dust in the beam lights up with it.
function lampColour() {
  if (warm < 0) { glareRGB = [0, 0, 0]; dustK = 0; return [0, 0, 0]; }
  const flick = 1 - .6 * Math.exp(-(((warm - .1) / .025) ** 2)) - .4 * Math.exp(-(((warm - .19) / .02) ** 2));
  const heat = ease(.1, 1.1, warm) ** .8, I = (.06 * ease(.03, .3, warm) + .94 * ease(.3, 1.2, warm) ** 1.6) * shutter * flick;
  const G = ease(.02, .18, warm) * flick * (.55 + .45 * ease(.3, 1.2, warm)) * shutter;
  glareRGB = [G, (.3 + .58 * heat) * G, (.07 + .63 * heat) * G];
  dustK = ease(.25, 1.15, warm);
  return [I, (.28 + .62 * heat) * I, (.05 + .73 * heat) * I];
}

function show(i, follow) {
  cur = i;
  const p = photos[i];
  $('count').textContent = `${i + 1} / ${P}`;
  $('time').textContent = p.taken ? p.taken.slice(11, 16) : '';
  $('title').textContent = p.description;
  $('live').textContent = p.description;
  if (follow) history.replaceState(null, '', '#' + p.id);
  wantFull(i);
}
// Step the carousel. While it turns, a further step changes where it stops.
function go(i) {
  i = ((i % P) + P) % P;
  if (reduced || warm < 0) { show(i, true); wake(); return; }
  if (change && !change.done) change.to = i;
  else if (change) queued = i;
  else change = { t: 0, to: i, done: false };
  wake();
}
const step = (dir) => go((change && !change.done ? change.to : queued ?? cur) + dir);
function turn(dt) {
  const t = change.t += dt;
  shutter = t < .04 ? 1 - t / .04 : t < .12 ? 0 : Math.min(1, (t - .12) / .05);
  if (!change.done && t >= .12) {
    change.done = true;
    show(change.to, true);
    Object.assign(focus, { x: 1.7, v: 0, w: 2 * Math.PI * 3.2, z: .42 }); // drops in a little soft and pulls sharp
    Object.assign(jig, { x: .0035, v: 0 }); // and settles in the gate
  }
  if (t >= .17) {
    shutter = 1; change = null;
    if (queued !== null) { const q = queued; queued = null; go(q); }
  }
}
const gust = () => { gustT = 0; wake(); };

// The draft from the window: a slow breath in and out across the sheet, and gusts on request.
function draft() {
  const { n, uv, acc, width, height } = cloth, t = time;
  const breath = reduced ? 0 : .11 * Math.sin(t * .55) + .06 * Math.sin(t * .23 + 1.7);
  for (let k = 0; k < n; k++) {
    const u = uv[k * 2] / width, v = uv[k * 2 + 1] / height, g = gustT - u * .4;
    const ripple = reduced ? 0 : .045 * Math.sin(t * .8 + u * 3.1 - v * 2.3) + .03 * Math.sin(t * .47 - u * 2.7 + v * 3.1);
    const e = g > 0 ? 4.2 * g / .3 * Math.exp(1 - g / .3) : 0; // a gust rises and falls, crossing from the left
    acc[k * 3] = e * .3;
    acc[k * 3 + 2] = (breath + ripple) * v + e * (.5 + .5 * v);
  }
}

// Dust: motes drift and slowly rise in the warm air between the projector and the sheet.
const motes = new Float32Array(MOTES * 4), moteV = new Float32Array(MOTES * 3), moteAge = new Float32Array(MOTES * 2);
const rand = mulberry32(5);
function seedMote(i, age) {
  const { proj, gc, half, throwZ } = view, depth = (.06 + rand() * .9) * throwZ;
  const s = gc[0] + (rand() * 2 - 1) * half * 1.05, t = gc[1] + (rand() * 2 - 1) * half * 1.05;
  motes.set([proj[0] + s * depth, proj[1] + t * depth, proj[2] - depth, reduced ? 1 : 0], i * 4);
  moteV.set([(rand() - .5) * .02, (rand() - .3) * .015, (rand() - .5) * .02], i * 3);
  moteAge[i * 2] = age; moteAge[i * 2 + 1] = 6 + rand() * 10;
}
function driftMotes(dt) {
  for (let i = 0; i < MOTES; i++) {
    const o = i * 4, a = moteAge[i * 2] += dt, span = moteAge[i * 2 + 1];
    if (a > span) { seedMote(i, 0); continue; }
    for (let c = 0; c < 3; c++) {
      moteV[i * 3 + c] = moteV[i * 3 + c] * (1 - .3 * dt) + (rand() - .5) * .03 * dt;
      motes[o + c] += moteV[i * 3 + c] * dt;
    }
    motes[o + 1] += .004 * dt;
    motes[o + 3] = Math.min(1, a / 1.5, (span - a) / 1.5);
  }
}

// ---------------------------------------------------------------------------
// Simulation and drawing
// ---------------------------------------------------------------------------
// dt drives the physics (at most 50 ms a frame); t, the time on screen (at most a second a frame),
// drives the lamp, the carousel and the lens, which keep their pace even when frames are slow.
function update(dt, t) {
  let busy = !reduced; // on screen, the draft never quite stops
  if (warm >= 0 && warm < 1.3) { warm += t; busy = true; }
  if (change) { turn(t); busy = true; }
  const turning = warm < 0 || warm >= .4, sub = Math.max(4, Math.ceil(t * 120)); // the lens is turned once there is light to focus by
  for (let i = 0; i < sub; i++) { if (turning) spring(focus, t / sub); spring(jig, t / sub); }
  if (Math.abs(focus.x) + Math.abs(focus.v) + (Math.abs(jig.x) + Math.abs(jig.v)) * 100 > 1e-3) busy = true;
  else focus.x = focus.v = jig.x = jig.v = 0;
  if (!reduced) { time += dt; driftMotes(dt); }
  if (gustT < 3) { gustT += dt; busy = true; }
  // The cloth in fixed 60 Hz steps (more while the cabin is still dark and it is settling in).
  // Under reduced motion it hangs still until moved, then settles quickly and sleeps.
  if (grab?.want) { // the cloth has some weight: it follows the hand a moment behind
    const k = 1 - Math.exp(-dt / .045);
    for (let i = 0; i < 3; i++) grab.at[i] += (grab.want[i] - grab.at[i]) * k;
    cloth.move(...grab.at);
  }
  if (grab || gustT < 3) calm = 0;
  if (calm > 40) { acc = 0; return busy; }
  acc += dt + (warm < 0 ? 2 / 60 : 0); // two steps ahead each frame while no one can see it
  let moved = 0;
  for (let n = 0; acc >= 1 / 60 && n < 5; n++, acc -= 1 / 60) {
    draft();
    moved = Math.max(moved, cloth.step(1 / 60, reduced && !grab ? .9 : undefined));
  }
  acc = Math.min(acc, 1 / 60);
  calm = reduced && moved < 1e-4 ? calm + 1 : 0;
  return true;
}

function shared(prog) {
  const { u } = prog, v = view, f = (name, ...a) => { if (u[name]) gl[`uniform${a.length}f`](u[name], ...a); };
  gl.useProgram(prog.p);
  if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, v.vp);
  if (u.uShadowVP) gl.uniformMatrix4fv(u.uShadowVP, false, v.shadowVP);
  f('uEye', ...v.eye); f('uProj', ...v.proj); f('uAxis', ...v.axis); f('uLamp', ...lampRGB);
  // on the wide sheet a portrait slide is thrown a little smaller, so it clears the pins and beam
  const a = photos[cur].aspect, fit = sheet.portrait ? 1 : .8, half = a >= 1 ? [1, 1 / a] : [a * fit, fit];
  f('uGate', v.gc[0], v.gc[1], v.half, v.d0); f('uOptic', half[0], half[1], v.throwZ, Math.abs(focus.x));
  f('uJiggle', 0, jig.x); f('uRes', W, H); f('uSheet', -sheet.w / 2, sheet.top - sheet.h, sheet.w / 2, sheet.top);
  f('uSheetZ', sheet.z); f('uLayer', cur); f('uFull', fullFor === cur ? 1 : 0); f('uHaze', HAZE);
  f('uSize', sheet.w, sheet.h); f('uTime', time); f('uTan', v.tan); f('uFocus', EYE_DIST); f('uDust', dustK);
}

function render() {
  lampRGB = lampColour();
  const { r, nrm, n } = cloth; // one upload: each vertex's position and normal
  for (let k = 0; k < n; k++) for (let t = 0; t < 3; t++) { surface[k * 6 + t] = r[k * 3 + t]; surface[k * 6 + 3 + t] = nrm[k * 3 + t]; }
  gl.bindBuffer(gl.ARRAY_BUFFER, surfBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, surface);
  gl.enable(gl.DEPTH_TEST);
  // the sheet as the projector sees it, for its shadow on itself and on the wall
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.viewport(0, 0, SHADOW, SHADOW);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2, 4);
  shared(shadowProgram);
  gl.bindVertexArray(clothVao);
  gl.drawElements(gl.TRIANGLES, cloth.index.length, gl.UNSIGNED_SHORT, 0);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // the sheet first, so the wall it covers is rejected before shading
  shared(clothProgram);
  gl.drawElements(gl.TRIANGLES, cloth.index.length, gl.UNSIGNED_SHORT, 0);
  shared(roomProgram);
  gl.bindVertexArray(roomVao);
  gl.drawArrays(gl.TRIANGLES, 0, roomCount);
  if (glareRGB[0] > 0) { // dust, added over everything it floats in front of
    shared(moteProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf); gl.bufferData(gl.ARRAY_BUFFER, motes, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    gl.bindVertexArray(moteVao);
    gl.drawArrays(gl.POINTS, 0, MOTES);
    const g = glareProgram.u, px = W / innerWidth; // and the lens, in front of everything
    gl.useProgram(glareProgram.p);
    gl.uniform2f(g.uAt, LENS[0], LENS[1]); gl.uniform2f(g.uRes, W, H); gl.uniform1f(g.uSize, 300 * px); gl.uniform1f(g.uScale, px);
    gl.uniform3f(g.uGlare, ...glareRGB);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  gl.bindVertexArray(null);
}

// Off screen a frame only redraws; on screen it also simulates, until nothing moves. A GPU that
// takes longer than a few frames to finish one (it learns this from its fences) is handed the next
// only when it is done, so it is never buried; a quick GPU, or a driver that reports a finished
// frame late, is never made to wait.
let fence = null, sent = 0, lag = .2;
function wake() { if (live && !raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  let busy = false;
  if (running()) {
    if (fence && gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED) { lag += ((now - sent) / 1000 - lag) * .3; gl.deleteSync(fence); fence = null; }
    if (fence && lag > .05 && now - sent < 4000) { wake(); return; }
    const real = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    busy = update(Math.min(real, .05), Math.min(real, 1));
  } else last = 0;
  render();
  if (fence) gl.deleteSync(fence);
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  sent = now;
  gl.flush();
  if (busy) wake(); else last = 0;
}

// ---------------------------------------------------------------------------
// Taking hold of the sheet, the caption, and the keys
// ---------------------------------------------------------------------------
const caption = $('caption');
let idle = 0;
function stir() { // the caption shows on any input and fades after a while without
  if (warm < 0) return;
  caption.classList.remove('is-idle');
  clearTimeout(idle);
  idle = setTimeout(() => caption.classList.add('is-idle'), 2500);
}
const rayAt = (cx, cy) => {
  const { tan, aspect } = view, x = (cx / innerWidth * 2 - 1) * tan * aspect, y = (1 - cy / innerHeight * 2) * tan, l = Math.hypot(x, y, 1);
  return [x / l, y / l, -1 / l];
};
const onPlane = (d, z) => { const { eye } = view, t = (z - eye[2]) / d[2]; return [eye[0] + d[0] * t, eye[1] + d[1] * t]; };
// The cloth under the pointer, or failing that the nearest cloth within a fingertip of it.
function pick(cx, cy) {
  const hit = cloth.raycast(view.eye, rayAt(cx, cy));
  if (hit >= 0) return hit;
  const { r: p } = cloth, m = view.vp;
  let best = -1, bestD = 44 * 44;
  for (let k = 0; k < cloth.n; k++) {
    const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2], w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const sx = ((m[0] * x + m[8] * z + m[12]) / w * .5 + .5) * innerWidth, sy = (.5 - (m[5] * y + m[9] * z + m[13]) / w * .5) * innerHeight;
    const d = (sx - cx) ** 2 + (sy - cy) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  stir();
  if (down) return; // one hand at a time
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
  canvas.setPointerCapture(e.pointerId);
  const k = pick(e.clientX, e.clientY);
  if (k < 0) return;
  const c = cloth.take(k) * 3, z = cloth.p[c + 2], [x, y] = onPlane(rayAt(e.clientX, e.clientY), z);
  grab = { z, x, y, dx: cloth.p[c] - x, dy: cloth.p[c + 1] - y, at: [cloth.p[c], cloth.p[c + 1], z], want: null };
  canvas.classList.add('is-holding');
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  stir();
  if (!grab || down?.id !== e.pointerId) {
    if (e.pointerType === 'mouse' && !down) canvas.classList.toggle('is-over', cloth.raycast(view.eye, rayAt(e.clientX, e.clientY)) >= 0);
    return;
  }
  // the held cloth follows the hand across, and comes toward you the farther it is pulled
  const d = rayAt(e.clientX, e.clientY), [x0, y0] = onPlane(d, grab.z);
  const z = grab.z + .22 * (1 - Math.exp(-Math.hypot(x0 - grab.x, y0 - grab.y) / .25)), [x, y] = onPlane(d, z);
  grab.want = [x + grab.dx, y + grab.dy, z];
  wake();
});
const release = (e) => {
  if (down?.id !== e.pointerId) return;
  if (grab) { cloth.release(); grab = null; canvas.classList.remove('is-holding'); }
  const tap = e.type === 'pointerup' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && e.timeStamp - down.t < 600;
  down = null;
  if (tap) step(1);
  wake();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
$('prev').onclick = () => { step(-1); stir(); };
$('next').onclick = () => { step(1); stir(); };
addEventListener('keydown', (e) => {
  stir();
  if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return; // the button presses itself
  if (e.key === 'ArrowRight' || e.key === ' ') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Enter') gust();
  else return;
  e.preventDefault();
});
addEventListener('resize', layout);

function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
// Dark until the slides are in; then the lamp warms up and the first slide pulls into focus.
const linked = photos.findIndex((p) => '#' + p.id === decodeURIComponent(location.hash));
show(Math.max(linked, 0), false);
layout();
live = true;
wake();
await loaded;
warm = reduced ? 9 : 0;
if (!reduced) Object.assign(focus, { x: 4.6, v: 0, w: 2 * Math.PI * 1.05, z: .5 });
stir();
wake();
if (parent !== window) {
  let sent = false;
  const done = () => { if (!sent) { sent = true; parent.postMessage({ type: 'platform:ready' }, '*'); } };
  requestAnimationFrame(() => requestAnimationFrame(done));
  setTimeout(done, 200); // frames may be held while the work is off screen
}
