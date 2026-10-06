// Receipt Roll: a thermal printer on a diner counter prints the night as a receipt. Pull the paper
// to print more; flick it to tear it off. Raw WebGL 2: the counter and printer are traced once into
// a texture; the paper is a strip mesh printed and lit in one shader, its shadow drawn in another.
import { createReceipt, DOTS, hhmm } from './receipt.js';
import { createPaper, PAPER, PRINTER, SLOT_Y, TOUCH } from './paper.js';

const ROOT = './';
const FOV = 30 * Math.PI / 180, TILT = .28; // a camera looking almost straight down at the counter
const LED = [-1.6, 3.3, PRINTER.h];          // the green light beside the feed button
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
if (!gl) { document.body.append('This work needs WebGL 2.'); throw new Error('WebGL 2 unavailable'); }

let W = 1, H = 1, raf = 0, last = 0, started = false, drag = null, told = -1, cut = false;
const cam = {};

// The platform feed tells works when they are off screen; standalone, the work simply runs.
let hostActive = true;
const running = () => hostActive && !document.hidden;
addEventListener('message', (e) => {
  if (e.source === parent && e.data?.type === 'platform:visibility') { hostActive = !!e.data.active; wake(); }
});
document.addEventListener('visibilitychange', wake);
if (parent !== window) parent.postMessage({ type: 'platform:hello' }, '*');

// ---------------------------------------------------------------------------
// Shaders. World units are centimetres: x to the right, y along the counter away from you
// (toward the printer), z up. A shaded lamp over the counter throws a pool of cool fluorescent
// light; a bare tube further back lays one long streak across the glossy counter and the printer's
// lid; a tall pink OPEN sign glows in the window to the right.
// ---------------------------------------------------------------------------
const COMMON = `
const float PAPER = ${PAPER.toFixed(2)}, PW = ${PRINTER.w.toFixed(2)}, PD = ${PRINTER.d.toFixed(2)}, PH = ${PRINTER.h.toFixed(2)};
const float RF = ${PRINTER.shoulder.toFixed(3)}, SLOTA = ${PRINTER.slot.toFixed(3)};
const vec3 LAMP = vec3(0, 1.5, 80), TUBE = vec3(0, 45, 55);
const vec3 COOL = vec3(.88, 1., .97), PINK = vec3(1., .14, .5), AMB = vec3(.022, .024, .032);
const float SIGN_X = 22.;
const vec4 SIGN = vec4(-11, 3, 4, 34); // the sign's extent along the counter (y) and up the window (z)
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }
// The lamp's shade throws a soft-edged pool over the printer and the paper.
float pool(vec3 p) {
  float r = length((p.xy - LAMP.xy) / vec2(12., 12.5) * LAMP.z / (LAMP.z - p.z));
  return smoothstep(1.05, .2, r) * (1. - .1 * r * r);
}
vec3 lamps(vec3 p, vec3 n) {
  return COOL * (1.3 * pool(p) * max(dot(n, normalize(LAMP - p)), 0.) + .045 * max(dot(n, normalize(TUBE - p)), 0.));
}
// The sign, as three glowing points down its length; the window frame keeps it off the far side.
vec3 neon(vec3 p, vec3 n) {
  float s = 0.;
  for (int i = 0; i < 3; i++) {
    vec3 l = vec3(SIGN_X, mix(SIGN.x + 2., SIGN.y - 2., float(i) * .5), mix(SIGN.z, SIGN.w, .3)) - p;
    float d = length(l);
    s += max(dot(n, l / d), 0.) / (d * d);
  }
  return PINK * s * 230. * smoothstep(-16., 8., p.x);
}
float glint(vec3 p, vec3 n, vec3 v, float k) { // the lamp's and the tube's highlights, as normalised Blinn lobes
  float a = 1.3 * pool(p) * pow(max(dot(n, normalize(normalize(LAMP - p) + v)), 0.), k);
  a += .07 * pow(max(dot(n, normalize(normalize(TUBE - p) + v)), 0.), k);
  return a * (k + 2.) / 8.;
}
vec3 tone(vec3 c) { return pow(1. - exp(-c * 1.35), vec3(1. / 2.2)); }`;
const FULL = 'void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }';

// The counter and the printer, traced once per size into a texture (alpha: 1 where the counter shows).
const room = program(FULL, `
${COMMON}
uniform vec2 uRes; uniform vec3 uEye, uF, uR, uU; uniform float uTan;
uniform vec2 uTube; // the tube's reflection: where it runs (y) and how high it hangs, set so it crosses the lid
out vec4 o;
const float RC = 1.6; // the body's corners, seen from above

// What a glossy surface at p sees along r: the tube as one long soft streak and the sign as a soft
// panel, each blurred the more the further the reflection travels; past them, the dim room.
vec3 mirrored(vec3 p, vec3 r, float rough) {
  vec3 c = COOL * .05 * smoothstep(.2, .9, r.y) * smoothstep(-.2, .5, r.z);
  if (r.z > 0.) {
    float t = (uTube.y - p.z) / r.z, w = .3 + rough * t;
    vec3 h = p + r * t;
    float d = (h.y - uTube.x) / w;
    c += COOL * 4. / w * exp(-2. * d * d) * smoothstep(42., 24., abs(h.x));
  }
  if (r.x > 0.) {
    float t = (SIGN_X - p.x) / r.x, w = .5 + rough * t;
    vec3 h = p + r * t;
    c += PINK * 2.2 * smoothstep(-w, w, min(min(h.y - SIGN.x, SIGN.y - h.y), min(h.z - SIGN.z, SIGN.w - h.z)));
  }
  return c;
}
float box2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float plan(vec2 p) { return box2(p - vec2(0, PD * .5), vec2(PW, PD) * .5 - RC) - RC; }
float side(vec2 q) { // seen from the side: the front top corner is the big round shoulder
  vec2 p = q - vec2(PD, PH) * .5;
  float r = p.y > 0. ? (p.x < 0. ? RF : .8) : .12;
  vec2 d = abs(p) - vec2(PD, PH) * .5 + r;
  return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - r;
}
float body(vec3 p) { vec2 w = vec2(plan(p.xy), side(p.yz)) + .35; return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - .35; }
vec3 normal(vec3 p) { const vec2 k = vec2(1, -1) * .002; return normalize(k.xyy * body(p + k.xyy) + k.yyx * body(p + k.yyx) + k.yxy * body(p + k.yxy) + k.xxx * body(p + k.xxx)); }

// Diner terrazzo laminate: angular chips in three sizes on a warm grey ground, a few of them coloured.
vec3 chips(vec3 c, vec2 p, float scale, float prob, float size, float px, float seed) {
  vec2 g = p * scale, i = floor(g), f = fract(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y), id = i + o + seed, h = hash2(id), k = hash2(id + 31.7);
    if (k.x > prob) continue;
    vec2 q = mat2(1. + .6 * k.x, .5 * h.y - .25, .5 * k.y - .25, 1. + .5 * h.y) * (f - o - h);
    float r = size * (.4 + .6 * k.y * k.y), d = -1.;
    for (int j = 0; j < 5; j++) { // a broken stone: five faces at uneven angles and distances
      float an = h.x * 6.283 + float(j) * 1.2566 + .7 * (hash(id + float(j) * 3.1) - .5);
      d = max(d, dot(q, vec2(cos(an), sin(an))) * (.75 + .5 * hash(id + float(j))));
    }
    float pick = fract(h.y * 7.13);
    vec3 tint = pick < .4 ? vec3(.27, .255, .225) : pick < .72 ? vec3(.065, .06, .057) : pick < .9 ? vec3(.2, .19, .175) : pick < .96 ? vec3(.24, .11, .075) : vec3(.07, .15, .15);
    c = mix(c, tint * (.85 + .3 * k.x), smoothstep(r + px * scale, r - px * scale, d));
  }
  return c;
}
vec3 laminate(vec2 p, float px) {
  vec3 c = vec3(.13, .12, .108) * (.9 + .14 * noise(p * .3) + .06 * noise(p * 2.1));
  c = chips(c, p, 1.4, .4, .15, px, 0.);
  c = chips(c, p, 3.5, .45, .16, px, 17.);
  return chips(c, p, 9., .35, .16, px, 41.);
}

vec3 counter(vec3 X, vec3 rd, float px) {
  vec3 L = normalize(LAMP - X);
  float d = max(plan(X.xy), 0.);
  float ao = (1. - .75 * exp(-d / .16)) * (1. - .45 * exp(-d / 1.5));                       // where the printer sits
  float sh = smoothstep(-.6, 1.6, plan(X.xy + L.xy * (PH / L.z)));                          // its shadow from the lamp
  float shn = smoothstep(-1.5, 2.5, plan(X.xy + (vec2(SIGN_X, -4) - X.xy) * PH / 14.));    // and from the sign
  vec3 col = laminate(X.xy, px) * (lamps(X, vec3(0, 0, 1)) * sh + AMB + neon(X, vec3(0, 0, 1)) * shn) * ao;
  // the laminate is glossy: the tube and the sign smear across it
  return col + mirrored(X, reflect(rd, vec3(0, 0, 1)), .02) * (.045 + .5 * pow(1. - abs(rd.z), 5.)) * mix(.6, 1., shn) * ao;
}

vec3 printer(vec3 X, vec3 rd) {
  vec3 n = normal(X), nn = n, V = -rd;
  vec3 alb = vec3(.012, .012, .013);
  float spec = .035, rough = 12., gloss = 0.;
  if (n.z > .15 && abs(n.x) < .7) { // the top: the slot and its tear bar on the shoulder, the button, the cover
    vec2 p = X.xy;
    float arc = atan(RF - p.y, X.z - PH + RF) * RF - SLOTA * RF; // along the shoulder from the slot
    float tri = 1. - 2. * abs(fract(p.x / .16) - .5);
    vec2 lq = p - vec2(0, 6.5), ld = abs(lq) - vec2(3., 2.25);
    float lid = length(max(ld, 0.)) + min(max(ld.x, ld.y), 0.) - .55; // the paper door
    vec2 out2 = sign(lq) * (max(ld.x, ld.y) > 0. ? normalize(max(ld, 1e-4)) : ld.x > ld.y ? vec2(1, 0) : vec2(0, 1));
    float btn = length(p - vec2(-2.5, 3.3)), led = length(p - LED_XY), notch = length(p - vec2(0, 3.66)) - .42;
    alb *= (.75 + .5 * noise(p * 70.)) * mix(.35, 1., smoothstep(.09, .3, abs(arc))); // powder-coated; shaded at the slot
    if (abs(p.x) < 3.3 && abs(arc) < .085) { alb = vec3(.0015) * smoothstep(.085, .03, -arc); spec = 0.; } // the throat
    else if (abs(p.x) < 3.45 && arc > .04 + .07 * (1. - tri) && arc < .11) { alb = vec3(.08); nn = normalize(n + vec3(fract(p.x / .16) < .5 ? -.8 : .8, 0, 0)); spec = .5; rough = 90.; }
    else if (abs(p.x) < 3.45 && arc > .11 && arc < .34) { alb = vec3(.05, .05, .055) * (.7 + .6 * noise(vec2(p.x * 1.5, arc * 300.))); spec = .07; rough = 30.; if (arc > .3) { nn = normalize(n - vec3(0, .7, 0)); spec = .45; rough = 140.; } }
    else if (abs(lid) < .018) { alb = vec3(.0012); spec = 0.; } // the seam round the door
    else if (lid < 0.) { // the door: glossy, its edge rounded over into the seam
      float bev = smoothstep(-.2, -.018, lid);
      nn = normalize(n + vec3(out2 * bev * bev * 1.1, 0));
      alb = vec3(.008); spec = .5 * bev; rough = 40.; gloss = 1.;
    }
    else if (notch < 0.) { nn = normalize(n + vec3((vec2(0, 3.66) - p) / .42 * .35 * smoothstep(-.42, 0., notch), 0)); alb *= .8; } // a finger notch to lift it
    else if (btn < .34) { nn = normalize(n + vec3((p - vec2(-2.5, 3.3)) / .34 * .7, 0)); alb = vec3(.035); spec = .08; rough = 9.; }
    else if (btn < .39) { alb = vec3(.002); spec = 0.; }
    else if (led < .08) { alb = vec3(.006, .03, .014); spec = .6; rough = 140.; nn = normalize(n + vec3((p - LED_XY) * 9., 0)); }
    else if (led < .11) { alb = vec3(.003); spec = 0.; }
  } else {
    if (abs(X.z - 1.) < .014) alb *= .2; // the shell's parting line
    alb *= .4 + .6 * smoothstep(0., .5, X.z);
    spec = .08; // the sides catch the sign
  }
  float fres = .04 + .96 * pow(1. - max(dot(nn, V), 0.), 5.);
  vec3 sign = normalize(vec3(SIGN_X, -4, 14) - X), Hn = normalize(sign + V);
  vec3 col = alb * (lamps(X, nn) + AMB * (.5 + .5 * nn.z) + neon(X, nn));
  col += (COOL * glint(X, nn, V, rough) + neon(X, nn) * 2.5 * pow(max(dot(nn, Hn), 0.), rough) * (rough + 2.) / 8.) * spec * (.3 + fres);
  vec3 r = reflect(rd, nn);
  if (gloss > 0.) col += (.6 * mirrored(X, r, .012) + COOL * .1 * smoothstep(.2, .9, r.y)) * (.05 + fres); // the door mirrors the tube and the dim room
  else if (spec > 0.) col += neon(X, nn) * .12 * pow(1. - max(dot(nn, V), 0.), 2.) * smoothstep(.2, .7, nn.x); // its right shoulder turns toward the sign
  return col;
}

void main() {
  vec2 q = (gl_FragCoord.xy * 2. - uRes) / uRes.y;
  vec3 rd = normalize(uF + (uR * q.x + uU * q.y) * uTan);
  float pix = 2. * uTan / uRes.y, tc = -uEye.z / rd.z;
  vec3 col = counter(uEye + rd * tc, rd, pix * tc);
  // the printer: sphere traced from where the ray enters its bounds; a near miss is its soft edge
  vec3 t0 = (vec3(-PW * .5, 0, 0) - .1 - uEye) / rd, t1 = (vec3(PW * .5, PD, PH) + .1 - uEye) / rd;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z), cover = 0.;
  if (a < b && b > 0.) {
    float t = max(a, 0.), best = 1e9, bt = t;
    for (int i = 0; i < 96; i++) {
      float d = body(uEye + rd * t), c = d / (pix * t);
      if (c < best) { best = c; bt = t; }
      if (c < .05 || t > b) break;
      t += d;
    }
    cover = clamp(1. - best, 0., 1.);
    if (cover > 0.) col = mix(col, printer(uEye + rd * bt, rd), cover);
  }
  o = vec4(tone(col) + (hash(gl_FragCoord.xy) - .5) / 255., 1. - cover);
}`.replace(/LED_XY/g, `vec2(${LED[0]}, ${LED[1]})`));

// The room from its texture, and the printer's light on top.
const blit = program(FULL, `
uniform sampler2D uBg; uniform vec4 uLed; // where the light is (pixels), its radius, how bright
out vec4 o;
void main() {
  vec3 c = texelFetch(uBg, ivec2(gl_FragCoord.xy), 0).rgb;
  float d = length(gl_FragCoord.xy - uLed.xy) / uLed.z;
  c += vec3(.4, 1, .55) * uLed.w * (smoothstep(1.1, .5, d) * .8 + .2 * exp(-d * .55) + .06 * exp(-d * .12));
  o = vec4(c, 1);
}`);

const STRIP = `
layout(location = 0) in vec3 aC; // a point on the paper's centreline
layout(location = 1) in vec3 aB; // across the paper
layout(location = 2) in vec3 aN; // the printed face's normal
layout(location = 3) in vec4 aM; // side (-1, 1), dot rows from the free end, tilt of the paper, distance along it
uniform mat4 uVP;`;

// The paper's shadow on the counter: soft in proportion to its height above it.
const shadow = program(`
${COMMON}
${STRIP}
uniform vec3 uL;
out float vX, vBlur, vDen;
void main() {
  float z = max(aC.z, 0.), blur = .045 + .3 * z;
  vX = aM.x * (PAPER * .5 + blur); vBlur = blur; vDen = .6 * exp(-z * .5);
  gl_Position = uVP * vec4(aC.xy - uL.xy / uL.z * z + normalize(aB.xy + vec2(1e-6, 0)) * vX, 0, 1);
}`, `
${COMMON}
uniform sampler2D uBg;
in float vX, vBlur, vDen;
out vec4 o;
void main() { o = vec4(0, 0, 0, vDen * smoothstep(PAPER * .5 + vBlur, PAPER * .5 - vBlur, abs(vX)) * texelFetch(uBg, ivec2(gl_FragCoord.xy), 0).a); }`);

const paperProg = program(`
${COMMON}
${STRIP}
out vec3 vP, vN, vB; out vec2 vUV; out float vTilt, vAlong;
void main() {
  vP = aC + aB * aM.x * PAPER * .5; vN = aN; vB = aB; vUV = vec2(aM.x * PAPER * .5, aM.y); vTilt = aM.z; vAlong = aM.w;
  gl_Position = uVP * vec4(vP, 1);
}`, `
${COMMON}
uniform mediump sampler2DArray uInk;
uniform vec4 uSeg[3]; // where a run of print starts (rows from the free end), its first row on the pages, its rows
uniform vec4 uStrip;  // rows of paper, the print head, the free end's edge and the top's (0 none, 1 torn, 2 cut)
uniform vec2 uSeed; uniform vec3 uEye;
uniform vec4 uRoll, uH[12]; // the roll's height along the strip: where it starts, the step, the steps
in vec3 vP, vN, vB; in vec2 vUV; in float vTilt, vAlong;
out vec4 o;
// How far a torn or cut edge eats into the paper, in rows: torn on the bar's teeth, or cut clean.
float edge(float x, float kind, float seed) {
  if (kind < .5) return -9.;
  if (kind > 1.5) return .6 + .8 * noise(vec2(x * 40., seed));
  float t = x / .16 + seed, tooth = 1. - 2. * abs(fract(t) - .5);
  return 1. + 6.5 * tooth * (.35 + .65 * hash(vec2(floor(t), seed))) + 1.8 * noise(vec2(x * 90., seed));
}
// How high the roll stands over this point of the strip.
float roll(float h) {
  float f = clamp((h - uRoll.x) / uRoll.y, 0., uRoll.z - 1.001);
  int i = int(f);
  return uRoll.z < 1. ? 0. : mix(uH[i / 4][i % 4], uH[(i + 1) / 4][(i + 1) % 4], fract(f));
}
// Worn dots of the print head print a little lighter, all the way down the paper.
float wear(float c) { return .13 * exp(-pow((c - 61.) / .9, 2.)) + .08 * exp(-pow((c - 158.) / .7, 2.)) + .1 * exp(-pow((c - 297.) / 1.1, 2.)); }
void main() {
  vec2 dots = vec2((vUV.x + 2.4) * 80., vUV.y), gx = dFdx(dots), gy = dFdy(dots);
  float foot = max(length(gx), length(gy)), fw = max(fwidth(vUV.y), 1e-3);
  float a = clamp((vUV.y - edge(vUV.x, uStrip.z, uSeed.x)) / fw, 0., 1.) * clamp((uStrip.x - edge(vUV.x, uStrip.w, uSeed.y) - vUV.y) / fw, 0., 1.);
  if (a < .02) discard;
  float ink = 0.;
  if (abs(vUV.x) < 2.4) for (int i = 0; i < 3; i++) {
    vec4 s = uSeg[i];
    float r = dots.y - s.x;
    if (r >= 0. && r < s.z) {
      float c = s.y + r, page = floor(c / 1024.);
      ink = textureGrad(uInk, vec3(dots.x / 384., (c - page * 1024.) / 1024., page), gx / 384., gy / 1024.).r;
    }
  }
  // close up, dots with a little bleed; far away, their average grey
  float w = clamp(foot * .5, .06, .5);
  ink = mix(smoothstep(.36 - w, .36 + w, ink), min(ink * 1.15, 1.), smoothstep(.8, 1.8, foot));
  ink *= smoothstep(uStrip.y + .5, uStrip.y - 2., dots.y) * (1. - wear(dots.x));
  vec3 black = mix(vec3(.008, .009, .017), vec3(.03, .031, .042), noise(dots * vec2(.03, .011) + uSeed.x)); // dense blue-black, unevenly
  vec3 N = normalize(vN), V = normalize(uEye - vP);
  bool front = dot(N, V) > 0.;
  if (!front) N = -N;
  float fibre = .965 + .035 * noise(dots * vec2(.6, .25)) + .02 * noise(dots * .05);
  vec3 alb = mix((front ? vec3(.93, .91, .855) : vec3(.85, .835, .79)) * fibre, black, front ? ink : ink * .07);
  // the printed face looks into the roll once the paper turns past upright
  float occ = front ? 1. - .55 * smoothstep(1.4, 2.9, vTilt) : 1. - .2 * smoothstep(2.4, 3.6, vTilt);
  float under = smoothstep(.04, .3, roll(vAlong) - vP.z); // in the roll's shade
  vec3 light = (lamps(vP, N) + .16 * lamps(vP, -N)) * (1. - .82 * under) + (AMB * (.6 + .4 * N.z) + neon(vP, N)) * (1. - .45 * under); // thin paper lets some through
  light += neon(vP, normalize(vB + N * .3)) * smoothstep(2.62, 2.9, vUV.x) * 1.6; // the sign catches its right edge
  vec3 col = alb * light * occ + COOL * (front ? .0015 : .0005) * glint(vP, N, V, 70.); // a satin coating: only a trace of sheen
  float below = uStrip.y - dots.y; // the slot's throat, and the shadow its lip casts on the paper just below
  col *= mix(.2, 1., smoothstep(0., 16., below)) * mix(.66, 1., smoothstep(10., 80., below));
  o = vec4(tone(col) + (hash(gl_FragCoord.xy) - .5) / 255., a);
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
  for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) { const { name } = gl.getActiveUniform(p, i); u[name.replace('[0]', '')] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// One buffer for every strip of paper, rebuilt each frame something moves.
const verts = new Float32Array(10 * 920 * 13); // up to nine receipts and the paper in the printer
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, i < 3 ? 3 : 4, gl.FLOAT, false, 52, i * 12); }
gl.bindVertexArray(null);

// Texture units: 0 the room, 1 the printed pages.
const bgTex = gl.createTexture(), bgFbo = gl.createFramebuffer();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, bgTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

// ---------------------------------------------------------------------------
// Photographs and the receipt
// ---------------------------------------------------------------------------
const data = await (await fetch(`${ROOT}photos.json`)).json();
const photos = data.photos.map((p) => ({ ...p, aspect: p.width / p.height, thumb: ROOT + p.thumb, full: ROOT + p.src }));
const rc = createReceipt(gl, 1, photos, data.album);
const paper = createPaper(rc, reduced);
for (const [prog, units] of [[blit, { uBg: 0 }], [shadow, { uBg: 0 }], [paperProg, { uInk: 1 }]]) {
  gl.useProgram(prog.p);
  for (const name in units) gl.uniform1i(prog.u[name], units[name]);
}

// Thumbnails are decoded at the printer's width and dithered as they arrive.
const scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
let decoded = 0;
const loaded = Promise.all(photos.map(async (p, k) => {
  try {
    const w = 384, h = Math.round(w / p.aspect);
    const img = await createImageBitmap(await (await fetch(p.thumb)).blob(), { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
    scratch.canvas.width = w; scratch.canvas.height = h;
    scratch.drawImage(img, 0, 0, w, h);
    rc.addPhoto(k, scratch.getImageData(0, 0, w, h).data);
    decoded++;
    wake();
  } catch (err) { console.warn('Missing photo', p.thumb, err); }
})).then(() => { document.body.dataset.loaded = String(decoded); });

// ---------------------------------------------------------------------------
// Camera: the paper fills most of a phone's width, with the printer's slot near the top; a wide
// screen leans back a little and comes as close as it can while keeping the whole printer and the
// receipt down to its roll in view.
// ---------------------------------------------------------------------------
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function camera() {
  const a = W / H, t = Math.tan(FOV / 2), k = Math.min(1, Math.max(0, (a - .7) / .6)), tilt = TILT + .27 * k;
  const f = [0, Math.sin(tilt), -Math.cos(tilt)], r = [1, 0, 0], u = [0, Math.cos(tilt), Math.sin(tilt)];
  const ndc = (d, yc, y, z) => { const v = [0, y - yc + f[1] * d, z + f[2] * d]; return dot3(v, u) / (dot3(v, f) * t); };
  const place = (d, y, z, at) => { let yc = TOUCH - 3; for (let i = 0; i < 16; i++) yc += (ndc(d, yc, y, z) - at) * d * t; return yc; };
  // a phone: the paper most of the width (and at least 15 cm of counter in view), the slot near the top
  const dp = PAPER / 2 / (Math.min(.79, PAPER / (15 * a)) * t * a), ycp = place(dp, SLOT_Y, PRINTER.h, .54);
  // a wide screen: the back of the printer just inside the top, the roll of the receipt at the bottom
  let lo = 10, hi = 150;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ndc(m, place(m, PRINTER.d, PRINTER.h, .965), TOUCH - 3.2, 0) < -.99) lo = m; else hi = m; }
  const d = dp + (lo - dp) * k, yc = ycp + (place(lo, PRINTER.d, PRINTER.h, .965) - ycp) * k, e = [0, yc - f[1] * d, -f[2] * d];
  const V = [1, 0, 0, 0, 0, u[1], -f[1], 0, 0, u[2], -f[2], 0, 0, -dot3(u, e), dot3(f, e), 1];
  const n = 2, far = 300, fy = 1 / t, P = [fy / a, 0, 0, 0, 0, fy, 0, 0, 0, 0, (far + n) / (n - far), -1, 0, 0, 2 * far * n / (n - far), 0];
  const vp = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) vp[c * 4 + i] += P[j * 4 + i] * V[c * 4 + j];
  // the tube hangs 55 cm up, along the line whose reflection crosses the middle of the printer's lid
  const tube = [6.5 + (6.5 - e[1]) * (55 - PRINTER.h) / (e[2] - PRINTER.h), 55];
  Object.assign(cam, { e, f, r, u, t, a, vp, d, tube, cmPerPx: 2 * d * t / innerHeight });
  cam.bottom = Math.min(...[-1, 1].map((x) => { const ray = dir(x, -1); return e[1] - ray[1] * e[2] / ray[2]; }));
}
function dir(nx, ny) {
  const { f, r, u, t, a } = cam, d = [0, 1, 2].map((i) => f[i] + (r[i] * nx * a + u[i] * ny) * t), l = Math.hypot(...d);
  return d.map((x) => x / l);
}
const rayAt = (cx, cy) => ({ o: cam.e, d: dir(cx / innerWidth * 2 - 1, 1 - cy / innerHeight * 2) });
function onPlane(cx, cy, z) { const { o, d } = rayAt(cx, cy), t = (z - o[2]) / d[2]; return [o[0] + d[0] * t, o[1] + d[1] * t]; }
function project(p) { // world → CSS pixels
  const m = cam.vp, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [(x / w + 1) / 2 * innerWidth, (1 - y / w) / 2 * innerHeight];
}

function layout() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  W = canvas.width = Math.max(1, Math.round(innerWidth * ratio));
  H = canvas.height = Math.max(1, Math.round(innerHeight * ratio));
  camera();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bgTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, bgFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bgTex, 0);
  gl.viewport(0, 0, W, H);
  gl.useProgram(room.p);
  gl.uniform2f(room.u.uRes, W, H);
  gl.uniform3fv(room.u.uEye, cam.e); gl.uniform3fv(room.u.uF, cam.f); gl.uniform3fv(room.u.uR, cam.r); gl.uniform3fv(room.u.uU, cam.u);
  gl.uniform1f(room.u.uTan, cam.t);
  gl.uniform2fv(room.u.uTube, cam.tube);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  wake();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function render() {
  const strips = paper.build(verts, cam.bottom), used = strips.reduce((n, s) => Math.max(n, s.first + s.count), 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, used * 13);
  gl.viewport(0, 0, W, H);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  // the room, and the printer's light: steady when it waits, blinking while it prints
  const P = paper.P, led = project(LED), px = W / innerWidth;
  const blink = paper.printing ? (Math.sin(P.time * 2 * Math.PI * 3.2) > -.2 ? 1 : .18) : .85;
  gl.useProgram(blit.p);
  gl.uniform4f(blit.u.uLed, led[0] * px, H - led[1] * px, .085 / (2 * cam.d * cam.t) * H * 1.1, blink);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(vao);
  // shadows first, onto the counter only
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(shadow.p);
  gl.uniformMatrix4fv(shadow.u.uVP, false, cam.vp);
  gl.uniform3f(shadow.u.uL, 0, .02, 1);
  for (const s of strips) gl.drawArrays(gl.TRIANGLE_STRIP, s.first, s.count);
  gl.disable(gl.BLEND);
  // then the paper itself
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.useProgram(paperProg.p);
  gl.uniformMatrix4fv(paperProg.u.uVP, false, cam.vp);
  gl.uniform3fv(paperProg.u.uEye, cam.e);
  for (const s of strips) {
    const seg = new Float32Array(12);
    s.segs.slice(-3).forEach((g, i) => seg.set([g.u, g.c, g.n, 0], i * 4));
    gl.uniform4fv(paperProg.u.uSeg, seg);
    gl.uniform4f(paperProg.u.uStrip, s.rows, s.head, s.edges[0], s.edges[1]);
    gl.uniform2fv(paperProg.u.uSeed, s.seed);
    gl.uniform4fv(paperProg.u.uRoll, s.roll);
    gl.uniform4fv(paperProg.u.uH, s.H);
    gl.drawArrays(gl.TRIANGLE_STRIP, s.first, s.count);
  }
  gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
}

// Off screen a frame only redraws; on screen it also moves the paper until all of it is still.
function wake() { if (!raf && started) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  let moving = false;
  if (running()) {
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now;
    moving = paper.step(dt);
    const k = paper.P.latest;
    if (k !== told && !drag && k >= 0) { told = k; say(`Printed ${[hhmm(photos[k].taken), photos[k].description].filter(Boolean).join(', ')}.`); }
    if (paper.P.done !== cut && (cut = paper.P.done)) { told = k; say('The whole night is printed. The printer cut the receipt; pull again for a reprint.'); }
  }
  render();
  if (moving && running()) wake(); else last = 0;
}
const say = (s) => { $('live').textContent = s; };

// ---------------------------------------------------------------------------
// Pulling, tearing, picking
// ---------------------------------------------------------------------------
function photoAt(cx, cy) {
  const { o, d } = rayAt(cx, cy), hit = paper.pick(o, d);
  const it = hit ? rc.itemAt(paper.printedAt(hit.strip, hit.row)) : null;
  return { k: it ? it.k : -1, hit };
}
function velocity(trail) { // pixels per millisecond over the last few samples
  const a = trail[0], b = trail[trail.length - 1], dt = Math.max(b[2] - a[2], 8);
  return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt];
}
canvas.addEventListener('pointerdown', (e) => {
  if (drag) return;
  canvas.setPointerCapture(e.pointerId);
  const { hit } = photoAt(e.clientX, e.clientY), z = hit ? hit.p[2] : 0, w = onPlane(e.clientX, e.clientY, z);
  // the paper in the printer, or the counter in front of the slot where it would be
  const live = hit ? !hit.strip.piece : Math.abs(w[0]) < PAPER / 2 + 2.5 && w[1] < SLOT_Y + .4;
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, z, w, x: w[0], live, done: paper.P.done, swing: paper.P.swing, trail: [[e.clientX, e.clientY, e.timeStamp]] };
  if (live) { paper.hold(true); canvas.classList.add('is-pulling'); }
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) {
    if (e.pointerType === 'mouse' && started) {
      const { k } = photoAt(e.clientX, e.clientY), w = onPlane(e.clientX, e.clientY, 0);
      canvas.classList.toggle('is-photo', k >= 0);
      canvas.classList.toggle('is-idle', k < 0 && !(Math.abs(w[0]) < PAPER / 2 + 2.5 && w[1] < SLOT_Y + .4));
    }
    return;
  }
  drag.trail.push([e.clientX, e.clientY, e.timeStamp]);
  while (drag.trail.length > 2 && e.timeStamp - drag.trail[0][2] > 90) drag.trail.shift();
  if (!drag.live) return;
  if (paper.P.done && !drag.done) { drag.live = false; paper.hold(false); return; } // the printer cut it
  const w = onPlane(e.clientX, e.clientY, drag.z);
  paper.pull((drag.w[1] - w[1]) * DOTS); // toward you draws paper out of the printer
  drag.w = w;
  paper.swingTo(drag.swing + Math.atan2(w[0] - drag.x, Math.max(TOUCH - w[1], 3)));
  // a quick flick across, or a snap back toward the printer, tears it on the teeth
  const [vx, vy] = velocity(drag.trail), dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, k = 1000 * cam.cmPerPx;
  if ((Math.abs(vx) > .75 && Math.abs(vx) > 1.5 * Math.abs(vy) && Math.abs(dx) > 26) || (vy < -.75 && -vy > 1.5 * Math.abs(vx) && dy < -26)) {
    if (paper.tear(vx * k, -vy * k)) { drag.live = false; paper.hold(false); canvas.classList.remove('is-pulling'); say('Torn off.'); }
  }
  wake();
});
const release = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const tap = e.type === 'pointerup' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8 && e.timeStamp - drag.t0 < 600;
  if (drag.live) {
    const still = e.timeStamp - drag.trail[drag.trail.length - 1][2] > 80, [, vy] = velocity(drag.trail);
    paper.release(tap || still || e.type !== 'pointerup' ? 0 : vy * 1000 * cam.cmPerPx * DOTS);
  }
  canvas.classList.remove('is-pulling');
  drag = null;
  if (tap) { const { k } = photoAt(e.clientX, e.clientY); if (k >= 0) open(k); }
  wake();
};
// Scrolling down draws the paper out too, as far as the page would have scrolled.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!drag && !e.ctrlKey && e.deltaY > 0) { paper.pull(e.deltaY * (e.deltaMode ? 16 : 1) * cam.cmPerPx * DOTS); wake(); }
}, { passive: false });
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
addEventListener('keydown', (e) => {
  if (box.open || e.altKey || e.ctrlKey || e.metaKey || !started) return;
  if (e.key === 'ArrowDown' || e.key === ' ') paper.pullOne();
  else if (e.key === 't' || e.key === 'T' || e.key === 'Backspace') { if (paper.tear((paper.P.pieces.length % 2 ? -1 : 1) * 40, -6)) say('Torn off.'); }
  else if (e.key === 'Enter') { if (paper.P.latest >= 0) open(paper.P.latest); }
  else return;
  e.preventDefault();
  wake();
});
addEventListener('resize', layout);

// ---------------------------------------------------------------------------
// Light box: the printed photo lifts off the paper as the original, in colour.
// ---------------------------------------------------------------------------
const box = $('box'), img = $('box-img');
let shown = -1;
function show(k) {
  const want = shown = (k + photos.length) % photos.length, p = photos[want];
  img.style.setProperty('--a', p.aspect);
  img.src = p.thumb; img.alt = p.description;
  $('time').textContent = hhmm(p.taken);
  $('title').textContent = p.description;
  say(p.description);
  history.replaceState(null, '', `#${p.id}`);
  const full = new Image();
  full.src = p.full;
  full.decode().then(() => { if (shown === want) img.src = full.src; }, () => {});
}
function open(k) {
  const spot = paper.photoSpot(k), a = photos[k].aspect;
  if (spot && !reduced) {
    const c = project(spot.p), l = project([spot.p[0] - 2.4, spot.p[1], spot.p[2]]), r = project([spot.p[0] + 2.4, spot.p[1], spot.p[2]]);
    const width = Math.min(innerWidth * .86, 1100, innerHeight * .7 * a);
    img.style.setProperty('--from', `translate(${c[0] - innerWidth / 2}px, ${c[1] - innerHeight / 2 + 28}px) scale(${Math.hypot(r[0] - l[0], r[1] - l[1]) / width})`);
  } else img.style.removeProperty('--from');
  show(k);
  img.style.animation = 'none';
  void img.offsetWidth; // restart the lift
  img.style.animation = '';
  if (!box.open) box.showModal();
}
box.addEventListener('close', () => { shown = -1; history.replaceState(null, '', location.pathname + location.search); canvas.focus({ preventScroll: true }); });
$('close').onclick = () => box.close();
$('prev').onclick = () => show(shown - 1);
$('next').onclick = () => show(shown + 1);
box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
box.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(shown + (e.key === 'ArrowRight' ? 1 : -1)); }
});

// ---------------------------------------------------------------------------
started = true;
layout();
await loaded;
wake();
const deep = photos.findIndex((p) => `#${p.id}` === decodeURIComponent(location.hash));
if (deep >= 0) open(deep);
if (parent !== window) {
  let sent = false;
  const ready = () => { if (!sent) { sent = true; parent.postMessage({ type: 'platform:ready' }, '*'); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 200); // frames may be held while the work is off screen
}
