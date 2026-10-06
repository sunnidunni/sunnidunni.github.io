// Double Prints: the night's photos came back from the one-hour lab in doubles, and the envelope
// has been tipped out across an oak table in morning sun through venetian blinds. One draw for the
// table and its light, one instanced draw for every print and the envelope, each after its shadow.
import { addBody, advance, bodies, order, grab, hold, release, sweep, deal, dealing, dealSpeed, topAt, toTop, toBottom, inside, view, KRAFT, MU, G } from './sim.js';
import { envelopeArt, backArt } from './paper.js';
const ROOT = './';
const LAYER = 384; // texture size per photograph; the print in the hand shows the full file
const FOV = 35 * Math.PI / 180, F = 1 / Math.tan(FOV / 2); // the camera looks straight down
const PRINT = [7.6, 5.1], BORDER = .32; // a 4 × 6 inch print (half sizes, cm) and its white border
const SLAT = 5.6; // the blind's slat pitch, cm
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
if (!gl) { document.body.append('This work needs WebGL 2.'); throw new Error('WebGL 2 unavailable'); }

let W = 1, H = 1, aspect = 1, HC = 100, raf = 0, last = 0, time = 0, live = false, fullFor = -1, fullWant = -1, backFor = -1, dealt = false, settled = false;
const air = []; // prints in the hand, or on their way up or down

// The platform feed tells works when they are off screen; standalone, the work simply runs.
let hostActive = true;
const running = () => hostActive && !document.hidden;
addEventListener('message', (e) => {
  if (e.source === parent && e.data?.type === 'platform:visibility') { hostActive = !!e.data.active; wake(); }
});
document.addEventListener('visibilitychange', wake);
if (parent !== window) parent.postMessage({ type: 'platform:hello' }, '*');

// ---------------------------------------------------------------------------
// Shaders. World units are centimetres on the table (z up, toward the camera).
// ---------------------------------------------------------------------------
const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }`;
const LIGHT = `${NOISE}
uniform vec3 uSun, uWall, uSunCol, uSky; uniform vec4 uWin, uBlind; uniform vec2 uOdd;
// Where a ray from P meets the window wall: across it, up it, and how far it went.
vec3 onWall(vec3 P, vec3 d) {
  float t = (uWall.z - dot(P.xy, uWall.xy)) / max(dot(d.xy, uWall.xy), 1e-3);
  vec3 Q = P + d * t;
  return vec3(dot(Q.xy, vec2(-uWall.y, uWall.x)), Q.z, t);
}
// The window opening, and the gaps of the blind with its ladder cords; pen softens edges.
float opening(vec3 w, float pen) {
  vec4 e = clamp(vec4(w.x - uWin.x, uWin.y - w.x, w.y - uWin.z, uWin.w - w.y) / pen + .5, 0., 1.);
  return e.x * e.y * e.z * e.w;
}
float slats(vec3 w, float pen) {
  // no two slats hang quite alike: each is tilted open a little more or less than its neighbours,
  // one has slipped nearly shut and one is missing altogether
  float k = (w.y - uBlind.z) / uBlind.x, i = floor(k), j = hash(vec2(i, 3.)), open = uBlind.y * (.76 + .48 * j), off = (j - .5) * .16;
  if (i == uOdd.x) { open = 1.2; off = 0.; }
  if (i == uOdd.y) open *= .3;
  float d = abs(fract(k) - .5 - off) * uBlind.x, q = (w.x - uWin.x) / (uWin.y - uWin.x);
  float cord = min(min(abs(q - .17), abs(q - .34)), min(abs(q - .66), abs(q - .83))) * (uWin.y - uWin.x);
  return clamp((uBlind.x * open * .5 - d) / pen + .5, 0., 1.) * (1. - .5 * min(1., .3 / pen) * clamp((.2 - cord) / pen + .5, 0., 1.));
}
// Direct sun at P: the sun is half a degree wide, so every edge softens with distance from the
// blind, the far side of the table most.
float sunAt(vec3 P) { vec3 w = onWall(P, uSun); float pen = .08 + w.z * .0045; return opening(w, pen) * slats(w, pen); }
// Daylight filling the room: stronger nearer the window and on surfaces turned to it, plus the warm
// light the sunlit patch of table throws back into the shade. Held up off the table, a print
// catches more of that bounce from the table, walls and ceiling.
vec3 skyAt(vec3 P, vec3 n) {
  float t = uWall.z - dot(P.xy, uWall.xy);
  return uSky * (.8 + .2 * n.z + .18 * dot(n.xy, uWall.xy)) * clamp(1.2 - .0036 * t, .7, 1.2)
       + vec3(1, .78, .56) * (.14 + .48 * smoothstep(2., 50., P.z)) * (.6 + .4 * abs(n.z));
}
vec3 tone(vec3 c) { return pow(1. - exp(-c), vec3(1. / 2.2)); }
// the lens darkens toward the corners of the frame, a little
float lens(vec3 P, float hc) { float c = (hc - P.z) / length(vec3(P.xy, hc - P.z)); return mix(1., c * c * c * c, .45); }`;

// The oak is baked once per size into a texture; every frame only lights it.
const FULL = `void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 1, 1); }`;
const wood = program(FULL, `${NOISE}
uniform vec2 uRes; uniform vec3 uCam;
out vec4 o;
// Honey oak boards, flat sawn: each board cut from a log a little off its axis, so the growth
// rings cross it in long arches, unevenly spaced; darker late wood, pores in fine dashes.
vec3 oak(vec2 p) {
  const float BOARD = 13.4;
  float row = floor(p.y / BOARD), fy = p.y / BOARD - row, r = hash(vec2(row, 7.1));
  float x = p.x + r * 173., len = 96. + 70. * r, seg = floor(x / len), fx = x / len - seg, id = hash(vec2(row * 3.1, seg + 2.));
  float y = (fy - .5) * BOARD, xl = (fx - .5) * len;
  float yc = (id - .5) * 22. + 3. * sin(xl * .013 + id * 7.), D = 1.5 + abs(xl * (.04 + .06 * id) + (id - .5) * 8.);
  float rad = sqrt((y - yc) * (y - yc) + D * D);
  rad += noise(vec2(xl * .03, y * .25 + id * 5.)) * 1.2 + noise(vec2(xl * .2, y * 1.6)) * .08;
  rad += 1.3 * noise(vec2(rad * .45, id * 11.)); // some years grew more than others
  float g = fract(rad * 1.15);
  float late = smoothstep(.45, .8, g) * (1. - smoothstep(.84, .99, g));
  float pores = smoothstep(.62, .9, noise(vec2(xl * .7, y * 5.))) * (.3 + .7 * late);
  float fibre = noise(vec2(xl * .28, y * 3.8)) * .5 + noise(vec2(xl * .04, y * .7 + id * 9.)) * .5;
  vec3 c = mix(vec3(.47, .25, .09), vec3(.6, .33, .125), id) * (.86 + .2 * fibre);
  c = mix(c, vec3(.3, .135, .045), late * .38 + pores * .22);
  float seam = min(min(fy, 1. - fy) * BOARD, min(fx, 1. - fx) * len);
  return c * mix(.28, 1., smoothstep(.02, .12, seam));
}
void main() { o = vec4(oak((gl_FragCoord.xy / uRes * 2. - 1.) * uCam.z / uCam.xy), 1); }`);

const table = program(FULL, `
${LIGHT}
uniform vec2 uRes; uniform vec3 uCam; uniform sampler2D uWood;
out vec4 o;
void main() {
  vec3 P = vec3((gl_FragCoord.xy / uRes * 2. - 1.) * uCam.z / uCam.xy, 0);
  vec3 col = texelFetch(uWood, ivec2(gl_FragCoord.xy), 0).rgb * (skyAt(P, vec3(0, 0, 1)) + uSunCol * uSun.z * sunAt(P)) * lens(P, uCam.z);
  o = vec4(tone(col) + (hash(gl_FragCoord.xy) - .5) / 255., 1);
}`);

const CARD = `
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPose; // centre, height, turn on the table
layout(location = 2) in vec4 aSize; // half width, half height, tilt about its width, turn about its height
layout(location = 3) in vec4 aCrop; // photo crop in texture space
layout(location = 4) in vec4 aMeta; // photo layer, kind, seed, flags
uniform vec3 uCam, uSun; uniform bool uPre; uniform float uCount;
out vec3 vP, vT, vB, vN; out vec2 vL;
flat out vec4 vSize, vCrop, vMeta, vShade;
invariant gl_Position;
vec2 rot(vec2 v, float c, float s) { return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }
void main() {
  if (uPre && mod(aMeta.y, 2.) < .5) { gl_Position = vec4(0); return; } // shadows write no depth
  float c = cos(aPose.w), s = sin(aPose.w);
  vCrop = aCrop; vMeta = aMeta; vSize = aSize; vShade = vec4(0); vT = vB = vN = vec3(0);
  if (mod(aMeta.y, 2.) < .5) {
    // a shadow: the card's outline thrown along the sun onto the table and blurred with height,
    // plus the daylight it keeps off the table close beneath it
    // (a print held up high would throw its shadow off the table; it is drawn nearer, bigger and
    // softer, so it stays in view and tells how high the print is)
    // The daylight it keeps off the table: close beneath a print lying low, and for one held high a
    // wide soft dimming around its sun shadow.
    float z = aPose.z, up = max(z - 6., 0.), zs = min(z, 6.) + up * .4, ss = .05 + z * .018 + up * .035;
    float sk = up > 0. ? ss * 1.7 : .25 + z * .45, ao = up > 0. ? .42 * smoothstep(0., 20., up) : z < 9. ? .5 / (1. + z * .7) : 0.;
    vec2 h = aSize.xy * vec2(abs(cos(aSize.w)), abs(cos(aSize.z))) * (1. + up * .008), off = rot(-uSun.xy / uSun.z * zs, c, -s);
    vec2 c0 = up > 0. ? off : vec2(0);
    float m = 2.5 * sk * step(.001, ao);
    vec2 lo = min(c0 - h - m, off - h - 3. * ss), hi = max(c0 + h + m, off + h + 3. * ss);
    vL = mix(lo, hi, aCorner + .5);
    vP = vec3(aPose.xy + rot(vL, c, s), 0);
    vSize = vec4(h, off); vShade = vec4(ss, sk, ao, z < 3. && abs(aSize.w) + abs(aSize.z) < .2 ? 1 : up > 0. ? 2 : 0);
  } else {
    // a card turned about its own height (a flip) and tilted about its width
    float cb = cos(aSize.w), sb = sin(aSize.w), ca = cos(aSize.z), sa = sin(aSize.z);
    vec3 T = vec3(cb, sb * sa, -sb * ca), B = vec3(0, ca, sa), N = vec3(sb, -cb * sa, cb * ca);
    vT = vec3(rot(T.xy, c, s), T.z); vB = vec3(rot(B.xy, c, s), B.z); vN = vec3(rot(N.xy, c, s), N.z);
    vL = aCorner * 2. * (aSize.xy + .15);
    vP = aPose.xyz + vT * vL.x + vB * vL.y;
  }
  // depth is the place in the stack: each card is nearer than every card drawn before it
  float w = uCam.z - vP.z, depth = 1. - (float(gl_InstanceID / 2) + 1.) / (uCount + 1.);
  gl_Position = vec4(vP.x * uCam.x, vP.y * uCam.y, (depth * 2. - 1.) * w, w);
}`;
const card = program(CARD, `
${LIGHT}
uniform mediump sampler2DArray uPhotos; uniform sampler2D uFull, uBack, uEnv; uniform vec3 uCam;
in vec3 vP, vT, vB, vN; in vec2 vL;
flat in vec4 vSize, vCrop, vMeta, vShade;
out vec4 o;
const float BORDER = ${BORDER};
vec2 erf2(vec2 x) { vec2 s = sign(x), a = abs(x); x = 1. + (.278393 + (.230389 + .078108 * (a * a)) * a) * a; x *= x; return s - s / (x * x); }
float box(vec2 p, vec2 h, float s) { vec2 a = erf2((h - p) / (s * 1.4142)), b = erf2((h + p) / (s * 1.4142)); return .25 * (a.x + b.x) * (a.y + b.y); }
float rbox(vec2 p, vec2 h, float r) { vec2 d = abs(p) - h + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
const vec3 LUM = vec3(.2126, .7152, .0722);
// What a glossy print mirrors toward the eye. Looking down, mostly the dim ceiling, so nothing to
// speak of; but where the window lands in it, its gloss (a slightly rough mirror) shows the window
// as a soft bright glare: sky between the slats, the slats lit from outside, the sun in a gap.
vec3 mirrored(vec3 P, vec3 R) {
  if (dot(R.xy, uWall.xy) <= 0. || R.z <= 0.) return vec3(0);
  vec3 w = onWall(P, R);
  float pen = 1. + w.z * .05, open = opening(w, pen), gap = slats(w, pen);
  return open * (mix(uSunCol * .6, vec3(4.2, 4.5, 5), gap) + uSunCol * 60. * pow(max(dot(R, uSun), 0.), 2000.) * gap);
}
void main() {
  int kind = int(vMeta.y + .5), flags = int(vMeta.w + .5);
  if ((kind & 1) == 0) {
    // how much darker the table (or the prints below) gets, judged on the tone-mapped image
    if (vShade.w > .5 && vShade.w < 1.5 && rbox(vL, vSize.xy - .3, 0.) < 0.) { o = vec4(0); return; } // under its own card, which covers it
    float sun = box(vL - vSize.zw, vSize.xy, vShade.x), sky = box(vL - (vShade.w > 1.5 ? vSize.zw : vec2(0)), vSize.xy + .03, vShade.y) * vShade.z;
    if (sun + sky < .004) { o = vec4(0); return; }
    vec3 Ls = uSunCol * uSun.z * sunAt(vP), Lk = skyAt(vP, vec3(0, 0, 1));
    float y0 = 1. - exp(-dot(Ls + Lk, LUM) * .4), y1 = 1. - exp(-dot(Ls * (1. - sun) + Lk * (1. - sky), LUM) * .4);
    o = vec4(0, 0, 0, clamp(1. - pow(y1 / max(y0, 1e-4), 1. / 2.2), 0., 1.));
    return;
  }
  vec2 h = vSize.xy, p = vL;
  float px = length(fwidth(p)) * .7, edge = rbox(p, h, .1), a = clamp(.5 - edge / px, 0., 1.);
  float notch = kind == 3 ? length(p - vec2(h.x, 0)) - 1.8 : 9.; // the thumb notch at the envelope's mouth
  a *= clamp(.5 + notch / px, 0., 1.);
  if (a < .004) { o = vec4(0); return; } // no discard here: it would stop the hidden parts being skipped
  bool front = gl_FrontFacing;
  // paper curls a little: edges lift, so the light and the sheen run across it, and the last few
  // millimetres turn up more steeply and catch a thin line of the window
  float sd = vMeta.z, flat_ = kind == 3 ? .25 : 1.;
  vec2 k = vec2(.1 + .3 * fract(sd * 7.13), .06 * fract(sd * 3.71)) * flat_, tw = vec2(.08 * (fract(sd * 5.3) - .5)) * flat_;
  vec2 slope = -2. * k * p / (h * h) - tw * p.yx / (h.x * h.y);
  if (kind == 1) slope -= sign(p) * smoothstep(.45, 0., h - abs(p)) * .38;
  vec3 n = normalize(vN + vT * slope.x + vB * slope.y);
  vec3 alb; float gloss;
  if (kind == 3) {
    alb = texture(uEnv, vec2(.5 + p.x / (2. * h.x), .5 - p.y / (2. * h.y))).rgb * (.93 + .12 * noise(p * 7.));
    gloss = .1;
  } else if (front) {
    vec2 hi = h - BORDER, t = clamp(vec2(.5 + p.x / (2. * hi.x), .5 - p.y / (2. * hi.y)), 0., 1.), uv = mix(vCrop.xy, vCrop.zw, t);
    vec3 photo = (flags & 2) != 0 ? texture(uFull, uv).rgb : texture(uPhotos, vec3(uv, vMeta.x)).rgb;
    if ((flags & 1) == 0) photo = vec3(.74, .74, .72); // still on its way: blank paper
    alb = mix(vec3(.93, .92, .885), photo * .95, clamp(.5 - rbox(p, hi, .03) / px, 0., 1.));
    gloss = 1.;
  } else {
    n = -n;
    alb = (flags & 4) != 0 ? texture(uBack, vec2(.5 - p.x / (2. * h.x), .5 - p.y / (2. * h.y))).rgb : vec3(.93, .92, .885);
    gloss = .12;
  }
  vec3 V = normalize(vP - vec3(0, 0, uCam.z));
  float lit = sunAt(vP), sun = lit * max(dot(n, uSun), 0.);
  vec3 col = alb * (skyAt(vP, n) + uSunCol * sun);
  // the edge of the paper: catching the sun on one side, a hairline of shade on the other
  if (kind == 1 && abs(vN.z) > .97) {
    vec2 e = h.x - abs(p.x) < h.y - abs(p.y) ? vec2(sign(p.x), 0) : vec2(0, sign(p.y));
    float face = dot(normalize(vT.xy * e.x + vB.xy * e.y), normalize(uSun.xy)), rim = clamp(1. + edge / (1.4 * px), 0., 1.);
    col *= 1. + rim * (face > 0. ? .5 * face * lit : .45 * face);
  }
  col += gloss * (.04 + .96 * pow(1. - abs(dot(V, n)), 5.)) * mirrored(vP, reflect(V, n));
  col *= lens(vP, uCam.z);
  o = vec4((tone(col) + (hash(gl_FragCoord.xy) - .5) / 255.) * a, a);
}`);

// The depth pass: every card's solid inside (a pixel in from its edge, so edges still blend over
// what lies beneath) at its place in the stack. The shaded pass then only colours what shows.
const depth = program(CARD, `
in vec2 vL; flat in vec4 vSize, vMeta;
out vec4 o;
float rbox(vec2 p, vec2 h, float r) { vec2 d = abs(p) - h + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
void main() {
  float px = length(fwidth(vL)) * .7, notch = vMeta.y > 2.5 ? length(vL - vec2(vSize.x, 0)) - 1.8 : 9.;
  if (rbox(vL, vSize.xy, .1) > -1.5 * px || notch < 1.5 * px) discard;
  o = vec4(0);
}`);

// Dust in the air, seen only where it drifts through a beam of sun.
const dust = program(`${LIGHT}
uniform vec3 uCam; uniform vec2 uView; uniform float uTime, uDepth, uPx;
out float vLit;
void main() {
  float i = float(gl_VertexID), t = uTime * (.5 + .5 * hash(vec2(i, 5.)));
  vec3 h = vec3(hash(vec2(i, 1.3)), hash(vec2(i, 7.7)), hash(vec2(i, 3.1)));
  vec3 P = vec3((h.xy * 2. - 1.) * uView * 1.15, 3. + 38. * h.z * h.z);
  P += vec3(2.5 * sin(t * .21 + i) + sin(t * .53 + i * 1.7), 2.5 * cos(t * .17 + i * 2.3) + sin(t * .41 + i), 3. * sin(t * .13 + i * 4.1));
  vLit = sunAt(P);
  float w = uCam.z - P.z;
  gl_Position = vec4(P.x * uCam.x, P.y * uCam.y, (uDepth * 2. - 1.) * w, w);
  gl_PointSize = vLit > .02 ? 1.2 + uPx * .14 / w : 0.;
}`, `
in float vLit;
out vec4 o;
void main() { float d = length(gl_PointCoord - .5) * 2.; o = vec4(vec3(1, .85, .64) * (1. - smoothstep(.2, 1., d)) * vLit * .8, 0); }`);

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
// Photographs, the prints made from them, and the envelope they came in
// ---------------------------------------------------------------------------
const { album = {}, photos: list } = await (await fetch(`${ROOT}photos.json`)).json();
const photos = list.map((p) => ({ ...p, aspect: p.width / p.height, thumb: ROOT + p.thumb, full: ROOT + p.src }));
const hhmm = (p) => p.taken ? p.taken.slice(11, 16) : '';

// Every photo printed twice, 4 × 6 with a thin border: landscape photos on landscape prints,
// portrait ones on portrait prints, each cropped around its focus point.
const prints = [];
photos.forEach((p, k) => {
  const portrait = p.aspect < 1, [hw, hh] = portrait ? [PRINT[1], PRINT[0]] : PRINT;
  const ai = (hw - BORDER) / (hh - BORDER), cw = Math.min(1, ai / p.aspect), ch = Math.min(1, p.aspect / ai);
  const [fx, fy] = p.focus || [.5, .5], u = Math.max(0, Math.min(1 - cw, fx - cw / 2)), v = Math.max(0, Math.min(1 - ch, fy - ch / 2));
  for (const copy of [1, 2]) {
    const id = addBody({ hw, hh, live: false });
    prints.push(id);
    Object.assign(bodies[id], { photo: k, copy, portrait, crop: [u, v, u + cw, v + ch], seed: (id * .618034 + .13) % 1, rest: .14 + ((id * .37) % 1) * .1, lift: 0, bag: true });
  }
});
const ENVELOPE = addBody({ hw: 9, hh: 6.25, fixed: true, surface: KRAFT, rest: .55, lift: 0, seed: .4 });

// Textures: 0 the photographs (one stretched layer each), 1 the photo in the hand in full,
// 2 the back of the print in the hand, 3 the envelope. All sRGB, so filtering happens in linear light.
const texture = (unit, target) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t); gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR); return t; };
const upload = (unit, img) => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
};
for (const unit of [1, 2]) { texture(unit, gl.TEXTURE_2D); gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 196, 255])); }
texture(3, gl.TEXTURE_2D);
const woodTex = texture(4, gl.TEXTURE_2D), woodFbo = gl.createFramebuffer();
const day = album.date ? new Date(album.date + 'T12:00:00') : null;
const date = day ? day.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const shortDate = day ? album.date.slice(2).split('-').reverse().join('.') : ''; // 03.10.26
upload(3, envelopeArt({ title: album.title || '', date, count: photos.length }));
texture(0, gl.TEXTURE_2D_ARRAY);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(LAYER)) + 1, gl.SRGB8_ALPHA8, LAYER, LAYER, photos.length);
const ready = new Uint8Array(photos.length);
const scratch = Object.assign(document.createElement('canvas'), { width: LAYER, height: LAYER }).getContext('2d');
const loaded = Promise.all(photos.map(async (p, i) => {
  try {
    // decoded and scaled off the main thread where the browser supports it
    let img = await createImageBitmap(await (await fetch(p.thumb)).blob(), { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
    if (img.width !== LAYER || img.height !== LAYER) { scratch.drawImage(img, 0, 0, LAYER, LAYER); img = scratch.canvas; }
    gl.activeTexture(gl.TEXTURE0);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    ready[i] = 1;
    wake();
  } catch (err) { console.warn('Missing photo', p.thumb, err); }
})).then(() => {
  gl.activeTexture(gl.TEXTURE0);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  document.body.dataset.loaded = String(ready.reduce((a, b) => a + b, 0));
  wake();
});

// One instanced draw: for every card, bottom to top, its shadow and then the card itself.
const STRIDE = 16, inst = new Float32Array(2 * (bodies.length + 2) * STRIDE);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const instBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i + 1); gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, STRIDE * 4, i * 16); gl.vertexAttribDivisor(i + 1, 1); }
gl.bindVertexArray(null);
gl.useProgram(card.p);
for (const [name, unit] of [['uPhotos', 0], ['uFull', 1], ['uBack', 2], ['uEnv', 3]]) gl.uniform1i(card.u[name], unit);
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

// ---------------------------------------------------------------------------
// The view, the window and the sun
// ---------------------------------------------------------------------------
const lightU = {};
function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = canvas.width = Math.round(innerWidth * dpr);
  H = canvas.height = Math.round(innerHeight * dpr);
  gl.viewport(0, 0, W, H);
  aspect = innerWidth / innerHeight;
  // a print's long side is about a sixth of a desktop's width and two fifths of a phone's
  const t = Math.max(0, Math.min(1, (innerWidth - 390) / 1050));
  const px = Math.min((.4 - .23 * t) * innerWidth, .36 * innerHeight);
  view.y = innerHeight / 2 / (px / (PRINT[0] * 2));
  view.x = view.y * aspect;
  HC = view.y * F;
  // Morning sun from the upper left, 36° up, through a window in a wall turned a little across it.
  // The opening is sized to the view: its slanted patch crosses the table with shade beyond it.
  const portrait = aspect < 1, az = portrait ? 2.25 : 2.5, el = 36 * Math.PI / 180;
  const sun = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
  const wa = az - .42, n = [Math.cos(wa), Math.sin(wa)], ln = sun[0] * n[0] + sun[1] * n[1], d = 50 * ln / sun[2];
  const onWall = (x, y) => { const t = (d - x * n[0] - y * n[1]) / ln; return [(x + sun[0] * t) * -n[1] + (y + sun[1] * t) * n[0], sun[2] * t]; };
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => onWall(i * view.x, j * view.y));
  const [s0, s1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const [h0, h1] = [Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1]))];
  // A tall window, its sill just above the table and its sides placed so that the sun through it
  // falls in a diagonal band across the middle of the table, shade either side. A print held up into
  // the light is in the sun too, and its gloss can catch the window. One slat is missing, near the
  // sill; one has slipped nearly shut.
  Object.assign(lightU, {
    uSun: sun, uWall: [...n, d], uWin: [s0 + (s1 - s0) * (portrait ? .3 : .32), s0 + (s1 - s0) * (portrait ? .76 : .7), h0 - 4, 210],
    uOdd: [Math.floor((h0 + (h1 - h0) * .22) / SLAT), Math.floor((h0 + (h1 - h0) * .72) / SLAT)],
    uSunCol: [1, .7, .43].map((c) => c * 3.75), uSky: [.6, .67, .8].map((c) => c * .7),
  });
  gl.useProgram(dust.p);
  gl.uniform2f(dust.u.uView, view.x, view.y);
  gl.uniform1f(dust.u.uPx, H / 2 * F);
  for (const { p, u } of [table, card, depth, dust]) {
    gl.useProgram(p);
    gl.uniform3f(u.uCam, F / aspect, F, HC);
    for (const k of ['uSun', 'uWall', 'uSunCol', 'uSky']) if (u[k]) gl.uniform3fv(u[k], lightU[k]);
    if (u.uWin) gl.uniform4fv(u.uWin, lightU.uWin);
    if (u.uOdd) gl.uniform2fv(u.uOdd, lightU.uOdd);
  }
  gl.useProgram(table.p);
  gl.uniform2f(table.u.uRes, W, H);
  gl.uniform1i(table.u.uWood, 4);
  // bake the oak at this size
  gl.activeTexture(gl.TEXTURE4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, woodFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, woodTex, 0);
  gl.useProgram(wood.p);
  gl.uniform2f(wood.u.uRes, W, H);
  gl.uniform3f(wood.u.uCam, F / aspect, F, HC);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // the envelope lies across the top left corner, its mouth toward the middle of the table
  const env = bodies[ENVELOPE];
  Object.assign(env, portrait ? { x: -view.x + 6.5, y: view.y - 8, a: -1.1 } : { x: -view.x + 9.5, y: view.y - 6.5, a: -.42 });
  // the prints still in it lie along it, alternately either way round
  order.forEach((i, k) => { if (bodies[i].bag) Object.assign(bodies[i], { x: env.x + Math.cos(env.a) * 1.1, y: env.y + Math.sin(env.a) * 1.1, a: env.a - (bodies[i].portrait ? Math.PI / 2 : 0) + (k % 2) * Math.PI }); });
  for (const q of air) aim(q);
  wake();
}
const toTable = (cx, cy, z = 0) => { const d = HC - z; return [(cx / innerWidth * 2 - 1) * d * aspect / F, (1 - cy / innerHeight * 2) * d / F]; };

// ---------------------------------------------------------------------------
// The spill: every print slides out of the envelope's mouth toward a spot on the table
// ---------------------------------------------------------------------------
function spill() {
  const rand = mulberry32(17), env = bodies[ENVELOPE], c = Math.cos(env.a), s = Math.sin(env.a);
  const spots = [];
  for (let k = 0; k < prints.length; k++) {
    let best = null, score = -Infinity;
    for (let tries = 0; tries < 30; tries++) {
      const x = (rand() * 2 - 1) * (view.x - 3), y = (rand() * 2 - 1) * (view.y - 3);
      const ex = x - env.x, ey = y - env.y, ahead = ex * c + ey * s;
      if (ahead < 13 || inside(env, x, y, 10)) continue; // in front of the mouth, clear of the envelope
      // spread out, in a fan along the mouth's direction; on a wide table the fan opens right out
      let d = 40;
      for (const q of spots) d = Math.min(d, Math.hypot((q.x - x) * .85, q.y - y));
      const v = d - Math.hypot(ex, ey) * (aspect < 1 ? .06 : .02) - Math.abs(ey * c - ex * s) * (aspect < 1 ? .2 : .1);
      if (v > score) { score = v; best = { x, y }; }
    }
    spots.push(best || { x: rand() * view.x * .5, y: -rand() * view.y * .5 });
  }
  // the far spots are dealt first, so later prints do not ride out on earlier ones; first copies
  // go far and second copies near, so the two prints of a photo land apart
  spots.sort((p, q) => Math.hypot(q.x - env.x, q.y - env.y) - Math.hypot(p.x - env.x, p.y - env.y));
  const seq = order.filter((i) => i !== ENVELOPE);
  const events = seq.map((i, k) => {
    // as they spin out toward their angles, half the prints turn one way and half the other: they
    // lie in the envelope either way round (spinning prints that touch push each other sideways,
    // and all turning the same way would drift the whole spill)
    const b = bodies[i], goal = (rand() - .5) * 1.2, spot = spots[k];
    // dealt like a card: a short glide on the air beneath it, then friction brings it to rest there
    const dx = spot.x - b.x, dy = spot.y - b.y, dist = Math.hypot(dx, dy), fly = .22, v = dealSpeed(dist, fly);
    return { i, t: .12 + k * .022 + rand() * .006, vx: dx / dist * v, vy: dy / dist * v, w: wrap(goal - b.a) / (fly + v / (2 * MU[0] * G)), fly, under: ENVELOPE, spot, goal };
  });
  dealt = true;
  if (!reduced) { deal(events); return; }
  for (const e of events) Object.assign(bodies[e.i], { x: e.spot.x, y: e.spot.y, a: e.goal, live: true, bag: false }); // already spread
  toBottom(ENVELOPE);
  settled = true;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// Picking a print up, turning it over, putting it back
// ---------------------------------------------------------------------------
// Where a print is held: up in the light above the caption, about two thirds of the view, and
// straight but for the degree or two a hand leaves it.
function aim(q) {
  const b = bodies[q.i], pill = 84 / innerHeight, fx = .68, fy = .65;
  const d = Math.max(b.hw * F / (aspect * fx), b.hh * F / fy);
  const settle = (wrap(q.a0) > 0 ? 1 : -1) * (.018 + .03 * b.seed);
  Object.assign(q, { x1: 0, y1: pill * d / F, z1: Math.max(4, HC - d), a1: q.a0 - wrap(q.a0) + settle });
}
function pickUp(i) {
  const b = bodies[i];
  b.live = false;
  let q = air.find((r) => r.i === i);
  if (!q) { q = { i, s: 0, sv: 0, f: 0, fv: 0, x0: b.x, y0: b.y, z0: b.rest, a0: b.a }; air.push(q); }
  q.goal = 1; q.flip = 0;
  aim(q);
  for (const r of air) if (r !== q) { r.goal = 0; r.flip = 0; }
  const p = photos[b.photo];
  history.replaceState(null, '', '#' + p.id);
  $('time').textContent = hhmm(p);
  $('title').textContent = p.description;
  $('copy-long').textContent = `copy ${b.copy} of 2`;
  $('copy-short').textContent = `${b.copy}/2`;
  $('caption').hidden = false;
  $('live').textContent = `${p.description}${hhmm(p) ? ', ' + hhmm(p) : ''}, copy ${b.copy} of 2`;
  if (backFor !== i) { upload(2, backArt({ portrait: b.portrait, frame: b.photo + 1, time: hhmm(p), copy: b.copy, date: shortDate })); backFor = i; }
  if (fullFor !== b.photo && fullWant !== b.photo) {
    fullWant = b.photo;
    fetch(p.full).then((r) => r.blob()).then((blob) => createImageBitmap(blob)).then((img) => {
      if (fullWant !== b.photo) return;
      upload(1, img); fullFor = b.photo; wake();
    }, () => {});
  }
  wake();
}
const holding = () => air.find((q) => q.goal === 1);
function putDown() {
  for (const q of air) { q.goal = 0; q.flip = 0; }
  $('caption').hidden = true;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  canvas.focus({ preventScroll: true });
  wake();
}
function turnOver() {
  const q = holding();
  if (!q) return;
  q.flip = q.flip ? 0 : -Math.PI;
  const b = bodies[q.i], p = photos[b.photo];
  $('live').textContent = q.flip ? `Back: No ${String(b.photo + 1).padStart(2, '0')}${hhmm(p) ? ', ' + hhmm(p) : ''}, ${b.copy} of 2` : p.description;
  wake();
}
// The prints of a photo: the copy nearer the top of the pile is the one picked up.
const copyOf = (k) => prints.filter((i) => bodies[i].photo === k).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
function step(dir) {
  const q = holding(), k = q ? (bodies[q.i].photo + dir + photos.length) % photos.length : dir > 0 ? 0 : photos.length - 1;
  pickUp(copyOf(k));
}
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('close').onclick = putDown;

// Springs for the hand: lifting overshoots a touch, turning over a little more.
function animate(dt) {
  let moving = false;
  for (let n = 0; n < 4; n++) {
    const h = dt / 4;
    for (const q of air) {
      q.sv += (70 * (q.goal - q.s) - 13.4 * q.sv) * h; q.s += q.sv * h;
      q.fv += (110 * (q.flip - q.f) - 12.6 * q.fv) * h; q.f += q.fv * h;
    }
  }
  for (let k = air.length; k--;) {
    const q = air[k], b = bodies[q.i];
    if (q.goal === 0 && q.s < .003 && Math.abs(q.sv) < .03 && Math.abs(q.f) < .01) {
      // back on the table, on top of the pile
      Object.assign(b, { x: q.x0, y: q.y0, a: q.a0, vx: 0, vy: 0, w: 0, live: true, awake: false });
      toTop(q.i);
      air.splice(k, 1);
    } else if (Math.abs(q.goal - q.s) + Math.abs(q.sv) + Math.abs(q.flip - q.f) + Math.abs(q.fv) > 1e-4) moving = true;
  }
  // a print held by a finger rises a little off the table
  for (const i of prints) {
    const b = bodies[i], goal = b.held ? 1.6 : 0;
    if (Math.abs(goal - b.lift) > 1e-3) { b.lift += (goal - b.lift) * (1 - Math.exp(-dt * 14)); moving = true; } else b.lift = goal;
  }
  for (const g of pointers.values()) if (g.kind === 'grab' && performance.now() - g.t > 40) hold(g.id, g.wx, g.wy, 0, 0); // the finger has stopped
  // once the deal is done and the pile is still, the envelope is just something else on the table
  if (dealt && !settled && !dealing() && !moving && !bodies.some((b) => b.live && b.awake)) {
    settled = true;
    const env = bodies[ENVELOPE];
    if (!prints.some((i) => bodies[i].live && [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].some(([u, v]) => inside(env, bodies[i].x + u * bodies[i].hw * .8, bodies[i].y + v * bodies[i].hh * .8)))) toBottom(ENVELOPE);
    if (deepLink >= 0) { pickUp(copyOf(deepLink)); deepLink = -1; }
  }
  return moving;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function put(n, b, kind, pose, size, flags) {
  const o = n * STRIDE;
  inst.set(pose, o); inst.set(size, o + 4);
  if (b.crop) inst.set(b.crop, o + 8);
  inst[o + 12] = b.photo ?? 0; inst[o + 13] = kind; inst[o + 14] = b.seed; inst[o + 15] = flags;
}
function render() {
  let n = 0, bag = 0;
  const flagsOf = (b, inHand) => (ready[b.photo] ? 1 : 0) | (inHand && fullFor === b.photo ? 2 : 0) | (inHand && backFor === b.id ? 4 : 0);
  for (let k = order.length; k--;) {
    const b = bodies[order[k]];
    if (b.live) b.bag = false;
    b.hidden = b.bag && ++bag > 2; // in the envelope only the top two could ever show, through the notch
  }
  for (const i of order) {
    const b = bodies[i];
    if (b.hidden || (!b.live && !b.bag)) continue;
    const env = i === ENVELOPE, g = b.held && [...pointers.values()].find((p) => p.i === i);
    // held by a finger: the held side up, the far side still on the table
    let tu = 0, tv = 0;
    if (g && b.lift > .01) { const c = Math.cos(b.a), s = Math.sin(b.a), dx = g.wx - b.x, dy = g.wy - b.y; tu = (dy * c - dx * s) / b.r * b.lift * .14; tv = -(dx * c + dy * s) / b.r * b.lift * .14; }
    const glide = b.fly > 0 ? 1.3 * Math.sin(Math.PI * b.fly / b.flyT) : 0; // a dealt print skimming out
    const pose = [b.x, b.y, b.rest + b.lift * .55 + glide, b.a], size = [b.hw, b.hh, tu, tv];
    put(n++, b, env ? 2 : 0, pose, size, 0);
    put(n++, b, env ? 3 : 1, pose, size, env ? 0 : flagsOf(b, false));
  }
  const pile = n / 2;
  for (const q of air.slice().sort((a, b) => a.s - b.s)) {
    const b = bodies[q.i], s = q.s, e = Math.max(0, Math.min(1, s));
    // Held up, it leans a little toward the window, more while it rises and as it turns over, so
    // the window's reflection slides across the gloss; and a hand never holds quite still.
    const still = reduced ? 0 : e * e, ph = b.seed * 40;
    const a = q.a0 + (q.a1 - q.a0) * e + still * .006 * Math.sin(time * .31 + ph);
    const lean = .1 * e + Math.max(-.5, Math.min(.5, q.sv * .2)) + .3 * Math.abs(Math.sin(q.f)) + still * .02 * Math.sin(time * .53 + ph), c = Math.cos(a), sn = Math.sin(a);
    const pose = [q.x0 + (q.x1 - q.x0) * s + still * (.1 * Math.sin(time * .43 + ph) + .03 * Math.sin(time * 1.1)), q.y0 + (q.y1 - q.y0) * s + still * .08 * Math.sin(time * .37 + 2 + ph), q.z0 + (q.z1 - q.z0) * s + still * .2 * Math.sin(time * .29 + 1), a];
    const [nx, ny, d] = lightU.uWall, mid = (lightU.uWin[0] + lightU.uWin[1]) / 2; // the middle of the window
    const tx = nx * d - ny * mid - pose[0], ty = ny * d + nx * mid - pose[1], tl = Math.hypot(tx, ty);
    const lx = (tx * c + ty * sn) / tl, ly = (ty * c - tx * sn) / tl;
    const size = [b.hw, b.hh, -ly * lean, q.f + lx * lean];
    put(n++, b, 0, pose, size, 0);
    put(n++, b, 1, pose, size, flagsOf(b, q.goal === 1 || q.s > .5));
  }
  const t = reduced ? 0 : time;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * STRIDE);
  // first only the depth of every card, so that below only what is on top gets shaded
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS); gl.depthMask(true); gl.colorMask(false, false, false, false); gl.disable(gl.BLEND);
  gl.useProgram(depth.p);
  gl.uniform1i(depth.u.uPre, 1); gl.uniform1f(depth.u.uCount, n / 2);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.colorMask(true, true, true, true); gl.enable(gl.BLEND);
  // the blind sways a little in the open window: its slats drift and open and close a touch
  const blind = [SLAT, .55 + .015 * Math.sin(t * .19), .3 * Math.sin(t * .29) + .16 * Math.sin(t * .71 + 1.3), 0];
  gl.useProgram(table.p);
  gl.uniform4fv(table.u.uBlind, blind);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(card.p);
  gl.uniform4fv(card.u.uBlind, blind); gl.uniform1f(card.u.uCount, n / 2);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  gl.bindVertexArray(null);
  if (!reduced) {
    gl.useProgram(dust.p);
    gl.uniform4fv(dust.u.uBlind, blind); gl.uniform1f(dust.u.uTime, t);
    gl.uniform1f(dust.u.uDepth, 1 - (pile + .5) / (n / 2 + 1)); // above the pile, below a print in the hand
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, 90);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  gl.disable(gl.DEPTH_TEST);
}

// Off screen a frame only redraws; on screen the pile is simulated while anything moves, and the
// blind sways in the window (unless reduced motion is preferred). A graphics card that takes longer
// than a few frames to finish one (learnt from its fences) is handed the next only when it is done,
// so a slow device drops frames instead of queueing them; a quick card, or a driver that reports a
// finished frame late, is never made to wait.
let fence = null, sent = 0, lag = .2;
function busy(now) {
  if (fence && gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED) { lag += ((now - sent) / 1000 - lag) * .3; gl.deleteSync(fence); fence = null; }
  return !!fence && lag > .05 && now - sent < 4000;
}
function wake() { if (live && !raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  let moving = false;
  if (running()) {
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now;
    if (!reduced) time += dt;
    moving = advance(dt);
    moving = animate(dt) || moving || !reduced;
    if (busy(now)) { wake(); return; }
  }
  render();
  if (fence) gl.deleteSync(fence);
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  sent = now;
  gl.flush();
  if (moving) wake(); else last = 0;
}

// ---------------------------------------------------------------------------
// Pointer and keyboard: press a print and drag it; press bare table and sweep; tap to pick up.
// ---------------------------------------------------------------------------
const pointers = new Map();
function hitHeld(cx, cy) {
  const q = holding();
  if (!q) return null;
  const b = bodies[q.i], [x, y] = toTable(cx, cy, q.z1);
  return Math.abs(x - q.x1) < b.hw * 1.04 && Math.abs(y - q.y1) < b.hh * 1.04 ? q : null;
}
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const [wx, wy] = toTable(e.clientX, e.clientY);
  const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, t: performance.now(), wx, wy, kind: 'none', i: -1 };
  pointers.set(e.pointerId, p);
  if (!holding()) {
    const i = topAt(wx, wy);
    if (i >= 0 && i !== ENVELOPE) { p.kind = 'grab'; p.i = i; grab(p.id, i, wx, wy); canvas.classList.add('is-dragging'); }
    else { p.kind = 'hand'; sweep(p.id, wx, wy); }
  }
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType !== 'mouse') return;
    const [wx, wy] = toTable(e.clientX, e.clientY), i = topAt(wx, wy);
    canvas.classList.toggle('is-pointer', !!hitHeld(e.clientX, e.clientY));
    canvas.classList.toggle('is-grab', !holding() && i >= 0 && i !== ENVELOPE);
    return;
  }
  const [wx, wy] = toTable(e.clientX, e.clientY, p.kind === 'grab' ? bodies[p.i].rest : 0), now = performance.now(), dt = Math.max((now - p.t) / 1000, 1 / 240);
  // the finger's velocity, smoothed a little; the held point is pulled toward the finger
  p.vx = (p.vx ?? 0) * .4 + (wx - p.wx) / dt * .6; p.vy = (p.vy ?? 0) * .4 + (wy - p.wy) / dt * .6;
  Object.assign(p, { wx, wy, t: now });
  if (p.kind !== 'none') hold(p.id, wx, wy, p.vx, p.vy);
  wake();
});
const lift = (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  release(p.id);
  canvas.classList.remove('is-dragging');
  const tap = e.type === 'pointerup' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && e.timeStamp - p.t0 < 600;
  if (tap) {
    if (hitHeld(e.clientX, e.clientY)) turnOver();
    else if (holding()) putDown();
    else if (p.kind === 'grab') pickUp(p.i);
  }
  wake();
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-pointer', 'is-grab'));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('button') && (e.key === 'Enter' || e.key === ' ')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') step(e.key === 'ArrowRight' ? 1 : -1);
  else if (e.key === 'Escape') { if (holding()) putDown(); else return; }
  else if (e.key === 'Enter') {
    if (holding()) turnOver();
    else { // the print nearest the middle of the view
      let best = -1, bd = Infinity;
      for (const i of prints) { const b = bodies[i], d = Math.hypot(b.x, b.y) - order.indexOf(i) * .2; if (b.live && d < bd) { bd = d; best = i; } }
      if (best >= 0) pickUp(best);
    }
  } else if (e.key === ' ' || e.key === 'f' || e.key === 'F') { if (holding()) turnOver(); else return; }
  else return;
  e.preventDefault();
});
addEventListener('resize', layout);

function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
let deepLink = photos.findIndex((p) => '#' + p.id === decodeURIComponent(location.hash));
// In the envelope, first copies under second ones, each set in its own shuffled order.
order.length = 0;
order.push(...prints.slice().sort((a, b) => (bodies[a].copy - bodies[b].copy) || (hash(bodies[a].photo * 3 + bodies[a].copy) - hash(bodies[b].photo * 3 + bodies[b].copy))), ENVELOPE);
live = true; // everything is in place: frames may run
layout();
// the envelope waits on the sunny table until the photos are in, then tips its prints out
await Promise.race([loaded, new Promise((r) => setTimeout(r, reduced ? 0 : 3000))]);
spill();
if (reduced && deepLink >= 0) { pickUp(copyOf(deepLink)); deepLink = -1; }
wake();
await loaded;
if (parent !== window) {
  let sent = false;
  const done = () => { if (!sent) { sent = true; parent.postMessage({ type: 'platform:ready' }, '*'); } };
  requestAnimationFrame(() => requestAnimationFrame(done));
  setTimeout(done, 200); // frames may be held while the work is off screen
}
