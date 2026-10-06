// Mirror Ball: the party is over and the mirror ball is still turning. Each of its mirrors carries
// one of the night's photos like a transparency, so the pin spot throws them round the room as
// squares of light. Raw WebGL 2 into a float buffer: one instanced draw for the mirrors, one for
// their light (sub-stepped into streaks when spun fast) and one for their beams in the haze.
import * as GLSL from './shaders.js';
import { ROOM_MIN, ROOM_MAX, BALL, RADIUS, LAMP, AIM, DOME, HALF, STRIDE, PROJECTION, mirrors, throwOf, camera, dot, cross, unit } from './optics.js';

const ROOT = './';
const LAYER = 256; // texture size per photo; a caught photo loads its full file
const MOTOR = .2; // rad/s: real mirror balls turn once or twice a minute
const SPIN = .0028; // turn per CSS pixel dragged
const GAIN = 3400, PICTURE = 9, HAZE = .08, EXPOSURE = 1.1, BLOOM = .22; // light thrown by a square, by a caught photo, in the air; glow
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gl = canvas.getContext('webgl2', { alpha: false, depth: false, antialias: false, powerPreference: 'high-performance' });
if (!gl) { document.body.append('This work needs WebGL 2.'); throw new Error('WebGL 2 unavailable'); }
const FLOAT = !!gl.getExtension('EXT_color_buffer_float'); // without it, light is kept at a quarter scale

// The ball has turned by theta; a caught photo flies (fly.x, 0–1) from its square to the wall.
let W = 1, H = 1, raf = 0, last = 0, time = 0, live = false, view = camera(1);
let theta = 0, thetaPrev = 0, omega = reduced ? 0 : MOTOR, drag = null, mouse = null, hover = -1;
let lamp = 0, strike = -1; // the lamp's brightness, and seconds since it was switched on
let held = false, shown = null, prior = null, frameAspect = 1.5;
const fly = { x: 0, v: 0 };

// The platform feed tells works when they are off screen; standalone, the work simply runs.
let hostActive = true;
const running = () => hostActive && !document.hidden;
addEventListener('message', (e) => {
  if (e.source === parent && e.data?.type === 'platform:visibility') { hostActive = !!e.data.active; wake(); }
});
document.addEventListener('visibilitychange', wake);
if (parent !== window) parent.postMessage({ type: 'platform:hello' }, '*');

// ---------------------------------------------------------------------------
// Programs. Uniforms are set by name from one object per frame; each program takes what it uses.
// ---------------------------------------------------------------------------
const HEAD = `#version 300 es\nprecision highp float;\nprecision highp int;\nconst float OUT = ${FLOAT ? '1.' : '.25'};\n`;
function program([vs, fs]) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, HEAD + src);
    gl.compileShader(sh);
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getAttachedShaders(p).map((sh) => gl.getShaderInfoLog(sh)).join('\n') || gl.getProgramInfoLog(p));
  const u = {};
  for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) { const { name, type } = gl.getActiveUniform(p, i); u[name.replace('[0]', '')] = { loc: gl.getUniformLocation(p, name), type }; }
  return { p, u };
}
const P = Object.fromEntries(Object.entries(GLSL).map(([name, src]) => [name, program(src)]));
const SETTER = { [gl.FLOAT]: 'uniform1fv', [gl.FLOAT_VEC2]: 'uniform2fv', [gl.FLOAT_VEC3]: 'uniform3fv', [gl.FLOAT_VEC4]: 'uniform4fv', [gl.INT]: 'uniform1iv', [gl.INT_VEC2]: 'uniform2iv', [gl.SAMPLER_2D]: 'uniform1iv', [gl.SAMPLER_2D_ARRAY]: 'uniform1iv' };
function use(prog, values) {
  gl.useProgram(prog.p);
  for (const name in prog.u) {
    const v = values[name];
    if (v === undefined) continue;
    const { loc, type } = prog.u[name];
    if (type === gl.FLOAT_MAT4) gl.uniformMatrix4fv(loc, false, v); else gl[SETTER[type]](loc, typeof v === 'number' ? [v] : v);
  }
}
const buffer = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
const attrib = (loc, n, stride, offset, divisor = 0) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(loc, divisor); };

const FIXED = { uBall: BALL, uRadius: RADIUS, uHalf: HALF, uDome: DOME, uLampPos: LAMP, uMin: ROOM_MIN, uMax: ROOM_MAX, uAim: AIM, uReach: Math.hypot(...BALL.map((b, i) => b - LAMP[i])), uPhotos: 0, uHdr: 3, uBloom: 4 };

// ---------------------------------------------------------------------------
// The room's six faces (inward) and the hanger's steel: position, normal, material.
// ---------------------------------------------------------------------------
const solid = [];
const quad = (a, b, c, d, n, m) => { for (const v of [a, b, c, a, c, d]) solid.push(...v, ...n, m); };
const box = (c, h, m) => {
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const n = [0, 0, 0], u = [0, 0, 0], v = [0, 0, 0];
    n[a] = s; u[(a + 1) % 3] = h[(a + 1) % 3]; v[(a + 2) % 3] = h[(a + 2) % 3];
    const at = (i, j) => c.map((x, k) => x + n[k] * h[k] + u[k] * i + v[k] * j);
    quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), m === 3 ? n : n.map((x) => -x), m === 3 ? 3 : [0, 1, 2][a]);
  }
};
box(ROOM_MIN.map((v, i) => (v + ROOM_MAX[i]) / 2), ROOM_MIN.map((v, i) => (ROOM_MAX[i] - v) / 2), 0);
const top = ROOM_MAX[1], neck = BALL[1] + RADIUS;
box([BALL[0], neck + .01, BALL[2]], [.028, .014, .028], 3); // the cap
box([BALL[0], (neck + top - .1) / 2, BALL[2]], [.005, (top - .1 - neck) / 2, .005], 3); // the rod
box([BALL[0], top - .05, BALL[2]], [.065, .05, .065], 3); // the motor
const solidVao = gl.createVertexArray();
gl.bindVertexArray(solidVao);
buffer(new Float32Array(solid));
attrib(0, 3, 28, 0); attrib(1, 3, 28, 12); attrib(2, 1, 28, 24);
const emptyVao = gl.createVertexArray();

// ---------------------------------------------------------------------------
// Photos: one texture layer each, stretched square (crops restore their shape), in linear light.
// ---------------------------------------------------------------------------
const photos = (await (await fetch(`${ROOT}photos.json`)).json()).photos.map((p) => ({ ...p, aspect: p.width / p.height, thumb: ROOT + p.thumb, full: ROOT + p.src }));
const M = mirrors(photos);

const corner = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
const glass = buffer(M.data);
const tileVao = gl.createVertexArray(), spotVao = gl.createVertexArray();
for (const vao of [tileVao, spotVao]) {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corner); attrib(0, 2, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, glass);
  for (let i = 0; i < 3; i++) attrib(i + 1, 4, STRIDE * 4, i * 16, 1);
}
gl.bindVertexArray(null);

// Texture units: 0 the photos, 1 and 2 caught photos in full, 3 the light buffer, 4 and 5 its bloom.
const texture = (unit, target, filter = gl.LINEAR) => {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter]]) gl.texParameteri(target, k, v);
  return t;
};
const slots = [1, 2].map((unit) => {
  const tex = texture(unit, gl.TEXTURE_2D);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return { unit, tex, photo: -1, ready: false, mix: 0 };
});
const hdr = texture(3, gl.TEXTURE_2D, gl.NEAREST);
const depth = gl.createRenderbuffer();
const fbo = gl.createFramebuffer();
const glow = [4, 5].map((unit) => ({ tex: texture(unit, gl.TEXTURE_2D), fbo: gl.createFramebuffer() })); // the bloom, a quarter the size
const photoTex = texture(0, gl.TEXTURE_2D_ARRAY);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(LAYER) + 1, gl.SRGB8_ALPHA8, LAYER, LAYER, photos.length);
const scratch = Object.assign(document.createElement('canvas'), { width: LAYER, height: LAYER }).getContext('2d');
const loaded = Promise.all(photos.map(async (p, i) => {
  try {
    // decoded and scaled off the main thread where the browser supports it
    let img = await createImageBitmap(await (await fetch(p.thumb)).blob(), { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
    if (img.width !== LAYER || img.height !== LAYER) { scratch.drawImage(img, 0, 0, LAYER, LAYER); img = scratch.canvas; }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, photoTex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return 1;
  } catch (err) { console.warn('Missing photo', p.thumb, err); return 0; }
})).then((ok) => {
  gl.activeTexture(gl.TEXTURE0);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  document.body.dataset.loaded = String(ok.reduce((a, b) => a + b, 0));
});

// Switched on, a halogen pin spot flickers (on 60 ms, off 90 ms), then its filament warms up to full.
const flicker = (t) => t < .06 ? .55 : t < .15 ? .02 : 1 - Math.exp(-(t - .15) / .12);

function simulate(dt) {
  let moving = !reduced;
  if (!reduced) time += dt;
  if (strike >= 0 && strike < 1.2) { strike += dt; lamp = flicker(strike); moving = true; } else if (strike >= 1.2) lamp = 1;
  // the motor's slipping clutch draws any spin back to its slow turn, or to a stop for a caught
  // photo; a hand on the ball brakes it at once, and once the hand moves, the ball goes with it
  if (!drag || !drag.turning || held) {
    const goal = held || reduced || drag ? 0 : MOTOR;
    omega += (goal - omega) * (1 - Math.exp(-dt / (drag && !held ? .1 : held ? .35 : 1.1)));
    if (goal === 0 && Math.abs(omega) < 2e-3) omega = 0;
  } else omega = Math.max(-12, Math.min(12, (drag.goal - theta) / .08)); // the ball has weight: it lags a fast hand
  theta += omega * dt;
  if (Math.abs(theta) > 7) { const k = Math.round(theta / (2 * Math.PI)) * 2 * Math.PI; theta -= k; thetaPrev -= k; if (drag) drag.goal -= k; }
  moving ||= omega !== 0 || !!drag;
  // the caught photo: a critically damped spring toward the wall, or back into its square
  const goal = held ? 1 : 0, k = 38;
  fly.v += (k * (goal - fly.x) - 2 * Math.sqrt(k) * fly.v) * dt;
  fly.x += fly.v * dt;
  if (Math.abs(goal - fly.x) < 5e-4 && Math.abs(fly.v) < 5e-3) { fly.x = goal; fly.v = 0; } else moving = true;
  if (!held && fly.x === 0) shown = prior = null;
  // cross-fades between caught photos, and to each one's full file once decoded
  const e = 1 - Math.exp(-dt * 7);
  if (shown && shown.alpha < 1) { shown.alpha = Math.min(1, shown.alpha + (1 - shown.alpha) * e + .002); moving = true; }
  if (prior) { prior.alpha -= prior.alpha * e + .002; moving = true; if (prior.alpha <= 0) prior = null; }
  for (const s of slots) if (s.ready && s.mix < 1) { s.mix = Math.min(1, s.mix + (1 - s.mix) * e + .002); moving = true; }
  if (shown) { const a = photos[shown.photo].aspect; if (Math.abs(a - frameAspect) > 1e-3) { frameAspect += (a - frameAspect) * e; moving = true; } }
  return moving;
}

// ---------------------------------------------------------------------------
// A caught photo on its way (by x) from its square of light (or from its mirror, when that faces
// away from the lamp) to the back wall, turning to face the room as it grows.
// ---------------------------------------------------------------------------
const tmp = {};
const rectOf = (photo) => { const a = photos[photo].aspect, h = Math.min(PROJECTION.h, PROJECTION.w / a); return { w: h * a, h }; };
const mean = (pts) => [0, 1, 2].map((k) => (pts[0][k] + pts[1][k] + pts[2][k] + pts[3][k]) / 4);
function frameOf(q) { // the picture's right, up and facing directions
  const right = unit(q[1].map((v, k) => v - q[0][k] + q[2][k] - q[3][k]));
  const facing = unit(cross(right, q[3].map((v, k) => v - q[0][k] + q[2][k] - q[1][k])));
  return [right, cross(facing, right), facing];
}
function turnBetween(E, F) { // the rotation taking frame E onto frame F, as an axis and an angle
  const R = [0, 1, 2].map((a) => [0, 1, 2].map((b) => F[0][a] * E[0][b] + F[1][a] * E[1][b] + F[2][a] * E[2][b]));
  const angle = Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2)));
  let axis = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  if (Math.hypot(...axis) < 1e-5) { // no turn, or half a turn: read the axis off the diagonal
    const i = [0, 1, 2].reduce((m, j) => R[j][j] > R[m][m] ? j : m, 0), ki = Math.sqrt(Math.max((R[i][i] + 1) / 2, 1e-9));
    axis = [0, 1, 2].map((j) => j === i ? ki : R[i][j] / (2 * ki));
  }
  return { axis: unit(axis), angle };
}
const rotate = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c); return v.map((x, i) => x * c + kv[i] * s + k[i] * d); };
function flight(layer, x) {
  const lit = throwOf(M.data, layer.tile, theta, tmp) && !(tmp.axis === 2 && tmp.dir[2] > 0);
  const { w, h } = rectOf(layer.photo), S = tmp.centre, wall = ROOM_MIN[2] + .004, from = [], to = [], lean = [];
  // the picture as its mirror throws it: a w × h frame square to the light, carried on to the wall,
  // so it keystones a little with the mirror's height and side
  const mid = [0, PROJECTION.y, wall], dir = unit(mid.map((v, k) => v - S[k])), right = unit(cross(dir, [0, 1, 0])), up = cross(right, dir);
  for (let j = 0; j < 4; j++) {
    const cx = j === 1 || j === 2 ? 1 : -1, cy = j >= 2 ? 1 : -1;
    from.push(lit ? [tmp.q[j * 3], tmp.q[j * 3 + 1], tmp.q[j * 3 + 2]] : S.map((c, k) => c + (tmp.east[k] * cx + tmp.north[k] * cy) * HALF));
    const P = mid.map((v, k) => v - right[k] * cx * w / 2 + up[k] * cy * h / 2), f = (wall - S[2]) / (P[2] - S[2]);
    to.push(P.map((v, k) => S[k] + (v - S[k]) * f));
    lean.push(f);
  }
  const c0 = mean(from), c1 = mean(to), turn = turnBetween(frameOf(from), frameOf(to)), Q = new Float32Array(12);
  for (let j = 0; j < 4; j++) {
    const r = rotate(from[j].map((v, k) => v - c0[k]), turn.axis, turn.angle * x);
    for (let k = 0; k < 3; k++) { // kept inside the room as it turns, so no corner slips behind a wall
      const v = c0[k] + (c1[k] - c0[k]) * x + r[k] * (1 - x) + (to[j][k] - c1[k]) * x;
      Q[j * 3 + k] = Math.min(ROOM_MAX[k] - .004, Math.max(ROOM_MIN[k] + .004, v));
    }
  }
  const soft = lit ? Math.min(.09, Math.max(.02, .035 * tmp.t / Math.hypot(...LAMP.map((v, k) => v - S[k])) / (2 * HALF * tmp.m))) : .04;
  const s0 = [0, 1, 2, 3].map((j) => lit ? tmp.s[j] : 1), m0 = (s0[0] + s0[1] + s0[2] + s0[3]) / 4, m1 = (lean[0] + lean[1] + lean[2] + lean[3]) / 4;
  return { Q, S: s0.map((v, j) => v / m0 * (1 - x) + lean[j] / m1 * x), apex: S, axis: lit ? tmp.axis : 2, gain: lit ? tmp.gain : 2e-4, soft };
}

// ---------------------------------------------------------------------------
// Drawing: the room and the ball, then all the light, added up, then mapped for the screen.
// ---------------------------------------------------------------------------
function matrix({ eye, f, r, u, tan, aspect }) {
  const n = .05, far = 40, a = 1 / (tan * aspect), b = 1 / tan, c = (far + n) / (n - far), d = 2 * far * n / (n - far);
  const back = [-f[0], -f[1], -f[2]], t = [-dot(r, eye), -dot(u, eye), -dot(back, eye)], m = new Float32Array(16);
  for (let k = 0; k < 3; k++) { m[k * 4] = a * r[k]; m[k * 4 + 1] = b * u[k]; m[k * 4 + 2] = c * back[k]; m[k * 4 + 3] = -back[k]; }
  m[12] = a * t[0]; m[13] = b * t[1]; m[14] = c * t[2] + d; m[15] = -t[2];
  return m;
}
const WARM = [1, .88, .74], WHITE = [1, .95, .9];
function render() {
  const x = Math.min(Math.max(fly.x, 0), 1), steps = Math.min(10, Math.max(1, Math.ceil(Math.abs(theta - thetaPrev) * 62)));
  view = camera(W / H, x, frameAspect);
  const clear = view.rect, warmth = lamp * lamp * (3 - 2 * Math.min(lamp, 1));
  const u = {
    ...FIXED, uVP: matrix(view), uEye: view.eye, uCamF: view.f, uCamR: view.r, uCamU: view.u, uTan: view.tan, uRes: [W, H], uTime: time,
    uRot: theta, uRot0: thetaPrev, uRot1: theta, uSteps: steps, uLamp: lamp, uGlow: lamp * (1 - .55 * x), uMirror: 0, uLayers: photos.length,
    uLampCol: [1, .6 + .28 * warmth, .34 + .4 * warmth],
    uGain: GAIN * lamp, uDim: 1 - .7 * x, uHaze: HAZE * lamp * (1 - .85 * x), uSize: Math.min(W, H) * .07, uPx: W / innerWidth * 1.3,
    uHover: hover, uHome: [shown ? shown.tile : -1, prior ? prior.tile : -1], uHeldTile: shown ? shown.tile : -1, uHeld: x * (shown ? shown.alpha : 0),
    uClear: [clear.w / 2 + .05, clear.h / 2 + .05, PROJECTION.y, x * x], uExposure: EXPOSURE, uBloomK: BLOOM,
  };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, W, H);
  gl.depthMask(true); // a clear only reaches the depth buffer while it may be written
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  // the solid things; the floor marks the stencil, where its varnish will show reflections
  gl.enable(gl.STENCIL_TEST); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
  use(P.room, u); gl.bindVertexArray(solidVao);
  for (const [first, count, mark] of [[0, 12, 0], [12, 6, 1], [18, solid.length / 7 - 18, 0]]) { gl.stencilFunc(gl.ALWAYS, mark, 255); gl.drawArrays(gl.TRIANGLES, first, count); }
  gl.stencilFunc(gl.ALWAYS, 0, 255);
  use(P.body, u); gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  use(P.tiles, u); gl.bindVertexArray(tileVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, M.count);
  gl.disable(gl.STENCIL_TEST);
  if (lamp > 0) { // everything after this is light, added up
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    const spotsOnce = (mirror) => { // reflections, being blurred, need no sub-steps
      const n = mirror ? 1 : steps;
      use(P.spots, { ...u, uMirror: mirror, uSteps: n, uRot0: mirror ? theta : thetaPrev });
      gl.bindVertexArray(spotVao);
      for (let i = 1; i < 4; i++) gl.vertexAttribDivisor(i, n * 2); // a mirror's data serves its sub-steps, on two planes
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, M.count * n * 2);
      for (const layer of [prior, shown]) if (layer) picture(layer, x, u, mirror);
    };
    spotsOnce(0);
    // their reflections in the varnish: on the floor only, seen through it
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 1, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); gl.disable(gl.DEPTH_TEST);
    spotsOnce(1);
    gl.disable(gl.STENCIL_TEST); gl.enable(gl.DEPTH_TEST);
    use(P.haze, u); gl.bindVertexArray(tileVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, M.count);
    use(P.cone, u); gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    use(P.halo, u); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    use(P.motes, u); gl.drawArrays(gl.POINTS, 0, 70);
    if (shown && x > .01) { // the caught mirror's light crossing the room to its picture
      const f = flight(shown, x), { w, h } = rectOf(shown.photo);
      use(P.beam, { ...u, uApex: f.apex, uQ: f.Q, uRect: [0, PROJECTION.y, w, h], uLayer: shown.photo, uTint: WARM.map((c) => c * .22 * lamp * x * shown.alpha) });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.DEPTH_TEST);
    use(P.glints, u); gl.bindVertexArray(tileVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, M.count);
    gl.disable(gl.BLEND);
  }
  gl.disable(gl.DEPTH_TEST);
  // bloom: the light brighter than white, at a quarter size, blurred twice each way
  gl.bindVertexArray(emptyVao);
  gl.viewport(0, 0, Math.max(1, W >> 2), Math.max(1, H >> 2));
  gl.bindFramebuffer(gl.FRAMEBUFFER, glow[0].fbo);
  use(P.bright, u); gl.drawArrays(gl.TRIANGLES, 0, 3);
  for (const [from, to, step] of [[4, 1, [1, 0]], [5, 0, [0, 1]], [4, 1, [2.5, 0]], [5, 0, [0, 2.5]]]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, glow[to].fbo);
    use(P.blur, { uSrc: from, uStep: step }); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  use(P.tone, u); gl.drawArrays(gl.TRIANGLES, 0, 3);
  thetaPrev = theta;
}
function picture(layer, x, u, mirror) {
  const f = flight(layer, x), b = layer.tile * STRIDE + 8, crop = M.data.subarray(b, b + 4);
  const g = (GAIN * f.gain) ** (1 - x) * PICTURE ** x * lamp; // from its square's brightness to a picture's
  gl.bindVertexArray(emptyVao);
  use(P.proj, {
    ...u, uQ: f.Q, uS: f.S, uCrop: [0, 1, 2, 3].map((i) => crop[i] + ([0, 0, 1, 1][i] - crop[i]) * x), uLayer: layer.photo,
    uFull: layer.slot.unit, uFullMix: layer.slot.photo === layer.photo ? layer.slot.mix : 0, uSoft: f.soft + (.012 - f.soft) * x,
    uTint: WARM.map((c, i) => (c + (WHITE[i] - c) * x) * g), uAlpha: layer.alpha, uAxis: x < .5 ? f.axis : 2, uGrow: 1 + .3 * x, uSpill: x, uMirror: mirror,
  });
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = canvas.width = Math.round(innerWidth * dpr);
  H = canvas.height = Math.round(innerHeight * dpr);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, hdr);
  gl.texImage2D(gl.TEXTURE_2D, 0, FLOAT ? gl.RGBA16F : gl.RGBA8, W, H, 0, gl.RGBA, FLOAT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, W, H);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hdr, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
  for (const [i, g] of glow.entries()) {
    gl.activeTexture(gl.TEXTURE4 + i);
    gl.texImage2D(gl.TEXTURE_2D, 0, FLOAT ? gl.RGBA16F : gl.RGBA8, Math.max(1, W >> 2), Math.max(1, H >> 2), 0, gl.RGBA, FLOAT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.tex, 0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  wake();
}

// Off screen a frame only redraws; on screen the ball turns (unless reduced motion is preferred)
// and the loop stops once nothing moves.
function wake() { if (live && !raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
  let moving = false;
  if (running()) { last = now; moving = simulate(dt); } else { last = 0; thetaPrev = theta; }
  if (mouse && !drag && !held && lamp > 0) {
    const hit = pick(mouse.x, mouse.y);
    hover = hit && hit.tile >= 0 && !hit.glass ? hit.tile : -1;
    canvas.classList.toggle('is-pointer', !!hit && hit.tile >= 0);
  }
  render();
  if (moving) wake(); else last = 0;
}

// ---------------------------------------------------------------------------
// Picking: what lies under a point of the screen (CSS pixels): the caught picture, a mirror on the
// ball, or a square of light (the brightest there, or else the nearest within reach of a finger).
// ---------------------------------------------------------------------------
function rayAt(cx, cy, cam = view) {
  const x = (cx / innerWidth * 2 - 1) * cam.tan * cam.aspect, y = (1 - cy / innerHeight * 2) * cam.tan;
  return unit([0, 1, 2].map((k) => cam.f[k] + cam.r[k] * x + cam.u[k] * y));
}
function onScreen(X, cam = view) {
  const rel = X.map((v, k) => v - cam.eye[k]), z = dot(rel, cam.f);
  return z > .05 ? [(dot(rel, cam.r) / (z * cam.tan * cam.aspect) + 1) / 2 * innerWidth, (1 - dot(rel, cam.u) / (z * cam.tan)) / 2 * innerHeight, z] : null;
}
function hitsBall(o, d) {
  const oc = o.map((v, k) => v - BALL[k]), b = dot(oc, d), h = b * b - dot(oc, oc) + RADIUS * RADIUS;
  return h > 0 && -b - Math.sqrt(h) > 0 ? -b - Math.sqrt(h) : -1;
}
function pick(cx, cy, reach = 0) {
  const o = view.eye, d = rayAt(cx, cy);
  if (held && shown && fly.x > .5 && d[2] < 0) {
    const t = (ROOM_MIN[2] - o[2]) / d[2], { w, h } = rectOf(shown.photo);
    if (Math.abs(o[0] + d[0] * t) < w / 2 && Math.abs(o[1] + d[1] * t - PROJECTION.y) < h / 2) return { picture: true, tile: -1 };
  }
  const tb = hitsBall(o, d);
  if (tb > 0) { // the mirror facing most nearly the way the ball does there
    const n = unit(o.map((v, k) => v + d[k] * tb - BALL[k])), c = Math.cos(theta), s = Math.sin(theta);
    let best = 0, score = -2;
    for (let i = 0; i < M.count; i++) {
      const b = i * STRIDE, sc = (c * M.data[b] + s * M.data[b + 2]) * n[0] + M.data[b + 1] * n[1] + (c * M.data[b + 2] - s * M.data[b]) * n[2];
      if (sc > score) { score = sc; best = i; }
    }
    return { tile: best, glass: true };
  }
  let t = Infinity, axis = 0;
  for (let a = 0; a < 3; a++) { const ta = ((d[a] > 0 ? ROOM_MAX[a] : ROOM_MIN[a]) - o[a]) / d[a]; if (ta < t) { t = ta; axis = a; } }
  const X = o.map((v, k) => v + d[k] * t), [i0, i1] = [[1, 2], [0, 2], [0, 1]][axis];
  let best = -1, bright = 0, near = -1, nearest = reach;
  for (let i = 0; i < M.count; i++) {
    if (!throwOf(M.data, i, theta, tmp) || (tmp.axis === 2 && tmp.dir[2] > 0)) continue;
    const q = tmp.q;
    if (tmp.axis === axis && Math.abs(tmp.value - X[axis]) < 1e-6) {
      const side = [0, 1, 2, 3].map((j) => { const a = j * 3, b = ((j + 1) & 3) * 3; return (q[b + i0] - q[a + i0]) * (X[i1] - q[a + i1]) - (q[b + i1] - q[a + i1]) * (X[i0] - q[a + i0]); });
      if ((side.every((v) => v > 0) || side.every((v) => v < 0)) && tmp.gain > bright) { bright = tmp.gain; best = i; }
    }
    if (reach > 0 && best < 0) {
      const s = onScreen(tmp.hit), dist = s ? Math.hypot(s[0] - cx, s[1] - cy) : Infinity;
      if (dist < nearest) {
        const to = tmp.hit.map((v, k) => v - o[k]), len = Math.hypot(...to), tb2 = hitsBall(o, to.map((v) => v / len));
        if (tb2 < 0 || tb2 > len) { nearest = dist; near = i; }
      }
    }
  }
  return { tile: best >= 0 ? best : near };
}

// ---------------------------------------------------------------------------
// Catching a photo: the ball eases to a stop and the square grows into the whole picture on the
// back wall while the others dim; letting go sends it back and the motor takes up the turn again.
// ---------------------------------------------------------------------------
const caption = $('caption');
function hold(tile) {
  if (tile < 0) return;
  const photo = M.photoOf[tile];
  if (shown && shown.tile === tile) { if (!held) { held = true; showCaption(photo); } return; }
  if (shown) prior = shown; // fades out where it is
  const slot = slots.find((s) => !prior || s !== prior.slot);
  shown = { tile, photo, slot, alpha: prior ? 0 : 1 };
  held = true;
  loadFull(shown);
  showCaption(photo);
  wake();
}
function letGo() {
  if (!held) return;
  held = false;
  caption.hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  canvas.focus({ preventScroll: true });
  wake();
}
function loadFull({ slot, photo }) {
  if (slot.photo === photo) return;
  Object.assign(slot, { photo, ready: false, mix: 0 });
  fetch(photos[photo].full).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((img) => {
    if (slot.photo !== photo) return;
    gl.activeTexture(gl.TEXTURE0 + slot.unit);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    slot.ready = true;
    wake();
  }, () => {});
}
// One of a photo's squares to catch it from: near the middle of the view from the door, on the back wall if it can be.
function tileFor(p) {
  const home = camera(W / H, 0);
  let best = -1, score = -Infinity;
  for (let i = 0; i < M.count; i++) {
    if (M.photoOf[i] !== p || !throwOf(M.data, i, theta, tmp) || (tmp.axis === 2 && tmp.dir[2] > 0)) continue;
    const s = onScreen(tmp.hit, home);
    if (!s || s[0] < 0 || s[0] > innerWidth || s[1] < 0 || s[1] > innerHeight) continue;
    const sc = (tmp.axis === 2 ? .3 : 0) - Math.hypot(s[0] / innerWidth - .5, s[1] / innerHeight - .55);
    if (sc > score) { score = sc; best = i; }
  }
  return best >= 0 ? best : M.photoOf.indexOf(p);
}
function step(dir) { // through the photos in the order they were taken
  const n = photos.length;
  for (let k = 1, p = shown ? shown.photo : 0; k <= n; k++) {
    const tile = tileFor((p + dir * k + n * k) % n);
    if (tile >= 0) return hold(tile);
  }
}
function showCaption(photo) {
  const p = photos[photo];
  $('time').textContent = p.taken ? p.taken.slice(11, 16) : '';
  $('title').textContent = p.description;
  $('live').textContent = p.description;
  caption.hidden = false;
  history.replaceState(null, '', '#' + p.id);
}
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('close').onclick = letGo;

// ---------------------------------------------------------------------------
// Input. Dragging sideways turns the ball under the hand; let go, it keeps the hand's speed.
// ---------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || drag) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, x: e.clientX, moved: 0, turning: false, goal: theta, trail: [[e.timeStamp, e.clientX]] };
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY }; if (!drag) wake(); }
  if (!drag || e.pointerId !== drag.id) return;
  drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
  if (!held && (drag.turning ||= drag.moved > 4)) drag.goal += (e.clientX - drag.x) * SPIN;
  drag.x = e.clientX;
  drag.trail.push([e.timeStamp, e.clientX]);
  while (drag.trail.length > 2 && e.timeStamp - drag.trail[0][0] > 100) drag.trail.shift();
  wake();
});
function up(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (e.type === 'pointerup') {
    if (d.moved < 8 && e.timeStamp - d.t0 < 600) tap(e.clientX, e.clientY, e.pointerType === 'mouse' ? 8 : 26);
    else if (held) { if (Math.abs(e.clientX - d.x0) > 40) step(e.clientX < d.x0 ? 1 : -1); }
    else { // the hand's speed over its last tenth of a second, unless it had stopped
      const [t0, x0] = d.trail[0], [t1, x1] = d.trail[d.trail.length - 1];
      omega = e.timeStamp - t1 > 60 || t1 - t0 < 1 ? 0 : Math.max(-10, Math.min(10, (x1 - x0) / (t1 - t0) * 1000 * SPIN));
    }
  }
  wake();
}
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => { mouse = null; hover = -1; canvas.classList.remove('is-pointer'); wake(); });
function tap(x, y, reach) {
  if (lamp <= 0) return;
  const hit = pick(x, y, reach);
  if (hit.picture) return;
  if (held) letGo(); // while a photo is caught, a tap anywhere but the picture lets it go
  else if (hit.tile >= 0) hold(hit.tile);
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (held) { e.preventDefault(); letGo(); } return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (held) step(dir); else { omega = Math.max(-10, Math.min(10, omega + dir * 1.5)); wake(); }
  } else if ((e.key === 'Enter' || e.key === ' ') && e.target === canvas) {
    e.preventDefault();
    if (held) letGo(); else if (lamp > 0) hold(pick(innerWidth / 2, innerHeight * .55, Infinity).tile);
  }
});
addEventListener('resize', resize);

// ---------------------------------------------------------------------------
live = true; // everything is in place: frames may run
resize();
await loaded;
if (reduced) { lamp = 1; strike = 2; } else strike = 0; // the pin spot strikes
wake();
const linked = photos.findIndex((p) => '#' + p.id === decodeURIComponent(location.hash));
if (linked >= 0) setTimeout(() => hold(tileFor(linked)), reduced ? 0 : 450);
if (parent !== window) {
  let sent = false;
  const ready = () => { if (!sent) { sent = true; parent.postMessage({ type: 'platform:ready' }, '*'); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 200); // frames may be held while the work is off screen
}
