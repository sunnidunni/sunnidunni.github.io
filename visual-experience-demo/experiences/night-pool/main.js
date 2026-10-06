// Night Pool: the night's prints afloat on a pool after the party, lit from below by its lamps and from
// above by a string of bulbs. Drag through the water to stir it; tap a print to lift it out. One pass
// draws the pool (water, tiles, lamps, deck), one instanced draw the prints, and a small one their shadows.
import { createWater, stepPrints } from './sim.js';
import { NB, FULL_VS, POOL_FS, BLUR_FS, PRINT_VS, PRINT_FS, SHADOW_VS, SHADOW_FS } from './shaders.js';

const ROOT = './';
const LAYER = 256;     // texture size per photograph; a lifted print loads its full file
const MIN_PRINTS = 12; // with fewer photographs, some float twice so the pool never looks empty
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
if (!gl) { document.body.append('This work needs WebGL 2.'); throw new Error('WebGL 2 unavailable'); }

let W = 1, H = 1, raf = 0, last = 0, acc = 0, clock = 0, time = 0, tick = 0, live = false;
let pool = [0, 0], water = null, held = -1, hover = -1, nextDrop = .35, dim = 1, focus = 0, dripAt = 0; // the first print drops as the lamps come up
const cam = {}, lamps = new Float32Array(6), bulbs = new Float32Array(NB * 3), rest = new Float32Array(NB * 3);
const hands = new Map(), queue = [], drops = [];

// The platform feed tells works when they are off screen; standalone, the work simply runs.
let hostActive = true;
const running = () => hostActive && !document.hidden;
addEventListener('message', (e) => {
  if (e.source === parent && e.data?.type === 'platform:visibility') { hostActive = !!e.data.active; wake(); }
});
document.addEventListener('visibilitychange', wake);
if (parent !== window) parent.postMessage({ type: 'platform:hello' }, '*');

// ---------------------------------------------------------------------------
// Programs, buffers and textures
// ---------------------------------------------------------------------------
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
const poolProgram = program(FULL_VS, POOL_FS), printProgram = program(PRINT_VS, PRINT_FS), shadowProgram = program(SHADOW_VS, SHADOW_FS), blurProgram = program(FULL_VS, BLUR_FS);

// Every print is one instance of a quad: 16 floats (centre and wetness, orientation, half size, photo
// layer and lift, border and flags), shared by the print and shadow programs.
const STRIDE = 16;
const quadVao = gl.createVertexArray(), screenVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const instances = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instances);
for (let i = 1; i <= 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, (i - 1) * 16); gl.vertexAttribDivisor(i, 1); }
gl.bindVertexArray(null);

// Texture units: 0 the photographs (one stretched layer each), 1 and 4 lifted photos in full (one
// rising, one going back down), 2 the water's heights, 3 the prints seen from above (their shadows, and
// where they float), 5 the pool's picture, to go out of focus behind a lifted print.
const texture = (unit, target) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t); gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR); return t; };
const full = [1, 4].map((unit) => { texture(unit, gl.TEXTURE_2D); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return { unit, k: -1 }; });
texture(2, gl.TEXTURE_2D);
const shadowTex = texture(3, gl.TEXTURE_2D);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
const shadowFbo = gl.createFramebuffer();
const sceneTex = texture(5, gl.TEXTURE_2D);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
const sceneFbo = gl.createFramebuffer();
for (const [prog, units] of [[poolProgram, { uHeight: 2, uShadow: 3 }], [printProgram, { uPhotos: 0, uFullA: 1, uFullB: 4 }], [blurProgram, { uScene: 5 }]]) {
  gl.useProgram(prog.p);
  for (const name in units) gl.uniform1i(prog.u[name], units[name]);
}

// ---------------------------------------------------------------------------
// Photographs and prints
// ---------------------------------------------------------------------------
const photos = (await (await fetch(`${ROOT}photos.json`)).json()).photos.map((p) => ({ ...p, aspect: p.width / p.height, thumb: ROOT + p.thumb, full: ROOT + p.src }));
const P = photos.length;
const rand = mulberry32(9);
const prints = Array.from({ length: Math.max(P, MIN_PRINTS) }, (_, k) => ({
  k, photo: k % P, mode: 0, out: false, x: 0, z: 0, a: 0, vx: 0, vz: 0, w: 0, y: 0, vy: 0, fall: 0, y0: 1,
  sx: 0, sz: 0, tvx: 0, tvz: 0, spin: (rand() - .5) * .04, lift: 0, liftV: 0, liftTo: 0, wait: 0, g: 8, wet: .6, c: [0, 0, 0], q: [0, 0, 0, 1],
}));
const data = new Float32Array((prints.length + 8) * STRIDE); // the prints, and a few drops

gl.activeTexture(gl.TEXTURE0);
texture(0, gl.TEXTURE_2D_ARRAY);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(LAYER) + 1, gl.RGBA8, LAYER, LAYER, P);
const scratch = Object.assign(document.createElement('canvas'), { width: LAYER, height: LAYER }).getContext('2d');
let arrived = 0;
const loaded = Promise.all(photos.map(async (p, i) => {
  try {
    // decoded and scaled off the main thread where the browser supports it
    let img = await createImageBitmap(await (await fetch(p.thumb)).blob(), { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
    if (img.width !== LAYER || img.height !== LAYER) { scratch.drawImage(img, 0, 0, LAYER, LAYER); img = scratch.canvas; }
    gl.activeTexture(gl.TEXTURE0);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    arrived++;
    // its prints drop into the pool, one after another
    for (const print of prints) if (print.photo === i) reduced ? Object.assign(print, { mode: 2 }) : queue.push(print);
    wake();
  } catch (err) { console.warn('Missing photo', p.thumb, err); }
})).then(() => {
  gl.activeTexture(gl.TEXTURE0);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  document.body.dataset.loaded = String(arrived);
  wake();
});

// ---------------------------------------------------------------------------
// Layout: the pool, the camera, the lamps and the string of bulbs
// ---------------------------------------------------------------------------
// Returns whether anything changed: a resize to the same size (screenshots fire them) costs nothing.
function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (w === W && h === H) return false;
  W = canvas.width = w;
  H = canvas.height = h;
  gl.activeTexture(gl.TEXTURE5);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // About 25 m² of water, its long side along the screen's (longer on tall screens, which see it more
  // from above); half sizes to the nearest 12.5 cm.
  const ar = W / H, ratio = Math.min(.8, Math.max(.4, (ar >= 1 ? 1.1 : .93) / Math.max(ar, 1 / ar)));
  const long = Math.round(Math.sqrt(25 / ratio) * 4) / 8, short = Math.round(long * ratio * 8) / 8;
  const next = ar >= 1 ? [long, short] : [short, long];
  if (next[0] !== pool[0] || next[1] !== pool[1]) fill(next);
  aim(ar);
  hang();
  lamps.set([-pool[0] * .42, -.6, -pool[1], pool[0] * .42, -.6, -pool[1]]);
  return true;
}

// A new pool: new water, and the prints sized to it, keeping their places in proportion.
function fill(next) {
  const [ox, oz] = pool;
  pool = next;
  water = createWater(...pool);
  gl.activeTexture(gl.TEXTURE2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, water.nx, water.nz, 0, gl.RGBA, gl.FLOAT, water.field);
  gl.activeTexture(gl.TEXTURE3);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, water.nx, water.nz, 0, gl.RG, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // a print's long side is a tenth of the pool's, unless so many prints would cover more than 30% of it
  const [px, pz] = pool, L = Math.min(.21 * Math.max(px, pz), Math.sqrt(1.6 * px * pz / prints.length));
  for (const p of prints) {
    const ap = photos[p.photo].aspect, b = .035 * L, inner = L - 2 * b;
    p.hw = (ap >= 1 ? inner : inner * ap) / 2 + b;
    p.hh = (ap >= 1 ? inner / ap : inner) / 2 + b;
    p.border = b; p.r = Math.hypot(p.hw, p.hh); p.I = (p.hw * p.hw + p.hh * p.hh) / 3;
    if (ox) { p.x *= px / ox; p.z *= pz / oz; }
  }
  if (!ox) scatter();
}

// Scatter the prints over the water: each at the first random spot clear of the others and the walls
// (or the roomiest of 40), so they start at rest; most face the right way up.
function scatter() {
  const [px, pz] = pool, placed = [];
  for (const p of prints) {
    let best = null, score = -Infinity;
    for (let k = 0; k < 40 && score < 0; k++) {
      const x = (rand() * 2 - 1) * (px - p.r), z = (rand() * 2 - 1) * (pz - p.r);
      let d = Infinity;
      for (const o of placed) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - (o.r + p.r) * .9);
      if (d > score) { score = d; best = { x, z }; }
    }
    Object.assign(p, best, { a: rand() < .8 ? (rand() - .5) * .9 : rand() * 6.283 });
    placed.push(p);
  }
  // let any that still touch push apart on calm water, unseen, so the pool starts at rest
  const calm = { slope: () => [0, 0], height: () => 0, dent() {} };
  for (const p of prints) p.mode = 2;
  for (let i = 0; i < 360; i++) stepPrints(prints, calm, [], pool, 1 / 120, 0);
  for (const p of prints) Object.assign(p, { mode: 0, vx: 0, vz: 0, w: 0 });
}

// The camera leans over the pool from the near side (60° on wide screens, 72° on tall ones) and stands
// as close as it can while the water, its coping and a strip of the far deck fit the frame.
function aim(ar) {
  const portrait = ar < 1, pitch = (portrait ? 72 : 58) * Math.PI / 180, tanY = portrait ? .5 : .36, tanX = tanY * ar;
  const s = Math.sin(pitch), c = Math.cos(pitch), F = [0, -s, -c], R = [1, 0, 0], U = [0, c, -s];
  const [px, pz] = pool, side = .15, far = .55, near = -.25;
  const ndc = (E, x, z) => { const v = [x - E[0], -E[1], z - E[2]], d = v[1] * F[1] + v[2] * F[2]; return [v[0] / (d * tanX), (v[1] * U[1] + v[2] * U[2]) / (d * tanY)]; };
  const eye = (d) => {
    let a = -pz - d, b = pz + d, E;
    for (let i = 0; i < 40; i++) { const zt = (a + b) / 2; E = [0, d * s, zt + d * c]; if (ndc(E, 0, -pz - far)[1] + ndc(E, 0, pz + near)[1] > 0) b = zt; else a = zt; }
    return E;
  };
  let lo = 1, hi = 80;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2, E = eye(d);
    const fits = [[-px - side, -pz - far], [px + side, -pz - far], [-px - side, pz + near], [px + side, pz + near]].every(([x, z]) => { const [u, v] = ndc(E, x, z); return Math.abs(u) <= 1 && Math.abs(v) <= 1; });
    if (fits) hi = d; else lo = d;
  }
  const E = eye(hi), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], n = .05, f = 100, A = (f + n) / (f - n), B = 2 * f * n / (f - n);
  Object.assign(cam, { E, F, R, U, tanX, tanY });
  cam.vp = new Float32Array([
    R[0] / tanX, U[0] / tanY, F[0] * A, F[0],
    R[1] / tanX, U[1] / tanY, F[1] * A, F[1],
    R[2] / tanX, U[2] / tanY, F[2] * A, F[2],
    -dot(R, E) / tanX, -dot(U, E) / tanY, -dot(F, E) * A - B, -dot(F, E),
  ]);
  // a lifted print faces the camera, the top of its photograph up
  const t = (Math.PI / 2 - pitch) / 2;
  cam.present = [Math.sin(t), 0, 0, Math.cos(t)];
}

// The string of bulbs is tied between two posts at the far end and sags between them. It hangs out of
// the frame, high enough to be seen only in the water, where its reflection crosses the middle.
function hang() {
  const [px, pz] = pool, E = cam.E;
  for (let raise = 0; raise < 8; raise += .25) {
    const zMid = E[2] + (-pz * .08 - E[2]) * (E[1] + 2.6 + raise) / E[1];
    let hidden = true;
    for (let i = 0; i < NB; i++) {
      // each bulb hangs on its own short drop, a little lower or higher, a little nearer or farther
      const s = i / (NB - 1), j = Math.sin(i * 12.9898) * 43758.5453 % 1, x = (s * 2 - 1) * (px + .6) + j * .08;
      const y = 3.3 + raise - .8 * Math.sin(Math.PI * s) + .15 * s - Math.abs(j) * .12, z = zMid + (s - .5) * .7 + j * .25;
      rest.set([x, y, z], i * 3);
      const v = [x - E[0], y - E[1], z - E[2]], d = v[1] * cam.F[1] + v[2] * cam.F[2];
      if (d > 0 && (v[1] * cam.U[1] + v[2] * cam.U[2]) / (d * cam.tanY) < 1.08) hidden = false;
    }
    if (hidden) break;
  }
  bulbs.set(rest);
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------
// In 120 Hz steps: the water every other step, the prints every step. A hand moves from where it was
// at the last frame to where it is now across the frame's steps.
function advance(dt) {
  acc += dt;
  const n = Math.floor(acc * 120 + 1e-6);
  acc -= n / 120;
  const active = [...hands.values()].filter((h) => h.on);
  let fastest = 0;
  for (let k = 1; k <= n; k++) {
    const steps = active.map((h) => ({ on: true, vx: carry(h.vx, h.vz), vz: carry(h.vz, h.vx), px: h.ox + (h.x - h.ox) * (k - 1) / n, pz: h.oz + (h.z - h.oz) * (k - 1) / n, x: h.ox + (h.x - h.ox) * k / n, z: h.oz + (h.z - h.oz) * k / n }));
    if (++tick & 1) {
      active.forEach((h, i) => stir(h, steps[i].x, steps[i].z));
      water.step();
    }
    fastest = Math.max(fastest, stepPrints(prints, water, steps, pool, 1 / 120, reduced ? 0 : 1));
    clock += 1 / 120;
    if (queue.length && clock >= nextDrop) { drop(queue.shift()); nextDrop = clock + .065; }
  }
  for (const [id, h] of hands) { h.ox = h.x; h.oz = h.z; h.vx *= Math.exp(-dt * 6); h.vz *= Math.exp(-dt * 6); if (h.up) hands.delete(id); }
  // lifting: a print rises toward you on a critically damped spring and falls back under gravity
  let lifting = 0;
  for (const p of prints) {
    if (p.liftTo && p.wait > 0) { p.wait -= dt; lifting = 1; }
    else if (p.liftTo) { p.liftV += (49 * (1 - p.lift) - 14 * p.liftV) * dt; p.lift += p.liftV * dt; p.wet = Math.max(.35, p.wet - dt * .05); }
    else if (p.out) {
      p.liftV -= p.g * dt; p.lift += p.liftV * dt;
      if (p.lift <= 0) { // back in the water, with a splash
        water.dent(p.x, p.z, Math.min(p.hw, p.hh) * .8, -.02 * Math.min(1, -p.liftV / 2.5));
        Object.assign(p, { out: false, lift: 0, liftV: 0, y: 0, vy: -.25, wet: .6 });
      }
    }
    if (p.out && (Math.abs(p.liftV) > 1e-3 || Math.abs(p.liftTo - p.lift) > 1e-3)) lifting = 1;
  }
  focus = Math.min(1, Math.max(0, ...prints.map((p) => p.out ? p.lift : 0)));
  dim = 1 - .45 * focus;
  drip(dt);
  return fastest > 1e-3 || water.motion > 1e-3 || lifting > 0 || queue.length > 0 || active.length > 0 || drops.length > 0;
}

// a hand carries floating things at most about as fast as a hand can move through water
const carry = (v, w) => v * Math.min(1, 1.6 / (Math.hypot(v, w) || 1));
// a hand drawn through the water pushes it down along its path, more the faster it goes
function stir(h, x, z) {
  const dx = x - h.wx, dz = z - h.wz, len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const n = Math.ceil(len / .02), a = -.12 * Math.min(Math.hypot(h.vx, h.vz), 2.5) * len / n;
  for (let i = 1; i <= n; i++) water.dent(h.wx + dx * i / n, h.wz + dz * i / n, .055, a);
  h.wx = x; h.wz = z;
}

// A lifted print still drips: now and then a drop gathers on its lower edge and falls, and where it
// meets the water behind it a tiny ring spreads.
function drip(dt) {
  const p = prints[held];
  if (p && p.lift > .92 && !reduced && clock > dripAt && drops.length < 6) {
    const { E, F, U, R } = cam, ex = rot(p.q, [1, 0, 0]), ez = rot(p.q, [0, 0, 1]), u = (rand() * 1.6 - .8) * p.hw;
    const at = [0, 1, 2].map((i) => p.c[i] + ex[i] * u + ez[i] * (p.hh + .004));
    const v = at.map((x, i) => x - E[i]), d = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
    drops.push({ at, vy: 0, y0: (v[0] * U[0] + v[1] * U[1] + v[2] * U[2]) / (d * cam.tanY), x0: (v[0] * R[0] + v[1] * R[1] + v[2] * R[2]) / (d * cam.tanX) });
    dripAt = clock + .45 + rand() * 1.1;
  }
  for (let i = drops.length; i--;) {
    const o = drops[i];
    o.vy -= 9.8 * dt; o.at[1] += o.vy * dt;
    const v = o.at.map((x, k) => x - cam.E[k]), d = v[0] * cam.F[0] + v[1] * cam.F[1] + v[2] * cam.F[2];
    if ((v[0] * cam.U[0] + v[1] * cam.U[1] + v[2] * cam.U[2]) / (d * cam.tanY) < o.y0 - .12) { // it has fallen past the print, into the pool behind
      const [x, z] = onWater((o.x0 + 1) / 2 * innerWidth, (1 - (o.y0 - .12)) / 2 * innerHeight);
      water.dent(x, z, .03, -.004);
      drops.splice(i, 1);
    }
  }
}

function drop(p) {
  Object.assign(p, { mode: 1, y: .35 + rand() * .3, fall: -.5, w: (rand() - .5) * 1.4, sx: (rand() - .5) * .5, sz: (rand() - .5) * .5 });
  p.y0 = p.y;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((x) => -x); d = -d; }
  if (d > .9995) return unit(a.map((x, i) => x + (b[i] - x) * t));
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return a.map((x, i) => x * ka + b[i] * kb);
}
const rot = (q, v) => { // v + 2 q×(q×v + w v)
  const [x, y, z, w] = q, t = [y * v[2] - z * v[1] + w * v[0], z * v[0] - x * v[2] + w * v[1], x * v[1] - y * v[0] + w * v[2]];
  return [v[0] + 2 * (y * t[2] - z * t[1]), v[1] + 2 * (z * t[0] - x * t[2]), v[2] + 2 * (x * t[1] - y * t[0])];
};

// Where a print is and how it lies: on the water, tilted with it; falling, still tumbling a little;
// lifted, on its way to the camera, turning to face it.
function pose(p) {
  const tilt = p.mode === 1 ? p.y / p.y0 : 1.4; // falling, it rights itself; afloat, it rides the water a little more than true
  const n = unit([-p.sx * tilt, 1, -p.sz * tilt]);
  let q = qmul(unit([n[2], 0, -n[0], 1 + n[1]]), [0, Math.sin(-p.a / 2), 0, Math.cos(-p.a / 2)]);
  let c = [p.x, p.y + .004, p.z];
  if (p.out) {
    const { E, F, U, tanX, tanY } = cam, d = Math.max(p.hw / (.84 * tanX), p.hh / (.76 * tanY)), up = .07 * d * tanY;
    const goal = [0, 1, 2].map((i) => E[i] + F[i] * d + U[i] * up), s = Math.min(Math.max(p.lift, 0), 1.2);
    c = c.map((v, i) => v + (goal[i] - v) * s);
    c[1] += Math.sin(Math.PI * Math.min(s, 1)) * .45;
    // held up, it sways a little, as if in a hand
    const k = Math.min(1, s) * (reduced ? 0 : 1), t = time + p.k;
    const sway = qmul([Math.sin(.004 * k * Math.sin(t * .7)), 0, 0, 1], [0, Math.sin(.006 * k * Math.sin(t * .53 + 1)), Math.sin(.003 * k * Math.sin(t * .61 + 2)), 1]);
    q = qmul(unit(sway), slerp(q, cam.present, Math.min(1, s * 1.3)));
    c = c.map((v, i) => v + U[i] * .003 * d * k * Math.sin(t * .8));
  }
  p.c = c; p.q = q;
}

function render() {
  // the string of bulbs sways a little, more in the middle than at its posts
  for (let i = 0; i < NB; i++) {
    const s = Math.sin(Math.PI * i / (NB - 1));
    bulbs[i * 3] = rest[i * 3] + Math.sin(time * .7 + i * .3) * .03 * s;
    bulbs[i * 3 + 2] = rest[i * 3 + 2] + Math.sin(time * .53 + 1 + i * .2) * .025 * s;
  }
  // prints afloat in a fixed order, then any falling, then any lifted, the highest last
  const key = (p) => p.out ? 10 + p.lift : p.mode === 1 ? 2 + p.y : p.k / prints.length;
  const order = prints.filter((p) => p.mode).sort((a, b) => key(a) - key(b));
  order.forEach((p, i) => {
    pose(p);
    const o = i * STRIDE, lift = p.out ? Math.min(1, Math.max(0, p.lift)) : 0;
    data[o] = p.c[0]; data[o + 1] = p.c[1]; data[o + 2] = p.c[2]; data[o + 3] = p.wet;
    for (let j = 0; j < 4; j++) data[o + 4 + j] = p.q[j];
    data[o + 8] = p.hw; data[o + 9] = p.hh; data[o + 10] = p.photo; data[o + 11] = lift;
    data[o + 12] = p.border; data[o + 13] = hover === p.k ? 1 : 0; data[o + 14] = full[0].k === p.k ? 1 : full[1].k === p.k ? 2 : 0;
    data[o + 15] = (1 - Math.min(1, lift * 2)) * (p.mode === 1 ? 1 - p.y / (p.y0 + .4) : 1); // its shadow fades as it rises
  });
  drops.forEach((d, i) => { // a drop: a small bead facing the camera
    const o = (order.length + i) * STRIDE;
    data.set(d.at, o); data.set(cam.present, o + 4);
    data[o + 8] = .0035; data[o + 9] = .0055; data[o + 11] = 1; data[o + 14] = -1; data[o + 15] = 0;
  });
  const count = order.length + drops.length, back = order.filter((p) => !p.out).length;
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, Math.max(count, 1) * STRIDE), gl.DYNAMIC_DRAW);
  gl.activeTexture(gl.TEXTURE2);
  water.pack(2.2); // slopes drawn about twice true, so ripples read at a distance
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, water.nx, water.nz, gl.RGBA, gl.FLOAT, water.field);

  // the shadow map: every print's soft footprint, seen from above
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.viewport(0, 0, water.nx, water.nz);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (order.length) {
    gl.blendEquation(gl.MAX);
    gl.useProgram(shadowProgram.p);
    gl.uniform2fv(shadowProgram.u.uPool, pool);
    drawPrints(0, order.length);
    gl.blendEquation(gl.FUNC_ADD);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE3);
  gl.generateMipmap(gl.TEXTURE_2D);

  // the pool, then the prints over it; behind a lifted print, both drawn first to a picture that goes
  // out of focus as it rises
  const blur = focus > .01;
  gl.bindFramebuffer(gl.FRAMEBUFFER, blur ? sceneFbo : null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  for (const { p, u } of [poolProgram, printProgram]) {
    gl.useProgram(p);
    gl.uniform3fv(u.uEye, cam.E); gl.uniform2fv(u.uPool, pool); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uDim, dim);
    gl.uniform3fv(u.uBulb, bulbs); gl.uniform3fv(u.uLamp, lamps);
  }
  const u = poolProgram.u;
  gl.useProgram(poolProgram.p);
  gl.uniform2f(u.uRes, W, H); gl.uniform2f(u.uTan, cam.tanX, cam.tanY); gl.uniform1f(u.uPix, 2 * cam.tanY / H);
  gl.uniform1f(u.uOn, reduced ? 9 : clock); // the lamps strike as the work first runs
  gl.uniform3fv(u.uF, cam.F); gl.uniform3fv(u.uR, cam.R); gl.uniform3fv(u.uU, cam.U);
  gl.bindVertexArray(screenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(printProgram.p);
  gl.uniformMatrix4fv(printProgram.u.uVP, false, cam.vp);
  drawPrints(0, blur ? back : count);
  if (!blur) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE5);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.disable(gl.BLEND);
  gl.useProgram(blurProgram.p);
  gl.uniform2f(blurProgram.u.uRes, W, H); gl.uniform1f(blurProgram.u.uBlur, focus * 2.4);
  gl.bindVertexArray(screenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(printProgram.p);
  drawPrints(back, count - back);
}
// instances from..from+n of the buffer, with blending (the prints' soft edges)
function drawPrints(from, n) {
  if (n <= 0) return;
  gl.enable(gl.BLEND);
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  for (let i = 1; i <= 4; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, (from * STRIDE + (i - 1) * 4) * 4);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
}

// Off screen a frame only redraws; on screen the water moves on (always, unless reduced motion is
// preferred, when the loop stops once everything has settled). A frame waits for the graphics card to
// finish the last one, so a slow (software) card never falls behind; a fast one has always finished.
let fence = null;
function wake() { if (live && !raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (fence) { if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) gl.finish(); gl.deleteSync(fence); fence = null; }
  const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
  let moving = false;
  if (running()) {
    last = now;
    if (!reduced) time += dt;
    moving = advance(dt) || !reduced;
  }
  render();
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (moving) wake(); else last = 0;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function ray(cx, cy) {
  const x = (cx / innerWidth * 2 - 1) * cam.tanX, y = (1 - cy / innerHeight * 2) * cam.tanY;
  return unit([0, 1, 2].map((i) => cam.F[i] + cam.R[i] * x + cam.U[i] * y));
}
// where a pointer meets the water, kept inside the pool
function onWater(cx, cy) {
  const d = ray(cx, cy), t = -cam.E[1] / Math.min(d[1], -1e-3);
  return [Math.max(-pool[0] + .02, Math.min(pool[0] - .02, cam.E[0] + d[0] * t)), Math.max(-pool[1] + .02, Math.min(pool[1] - .02, cam.E[2] + d[2] * t))];
}
// the print under a pointer, nearest the eye
function pick(cx, cy) {
  const d = ray(cx, cy), E = cam.E;
  let best = -1, bestT = Infinity;
  for (const p of prints) {
    if (!p.mode) continue;
    const n = rot(p.q, [0, 1, 0]), den = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    if (Math.abs(den) < 1e-6) continue;
    const t = ((p.c[0] - E[0]) * n[0] + (p.c[1] - E[1]) * n[1] + (p.c[2] - E[2]) * n[2]) / den;
    if (t <= 0 || t >= bestT) continue;
    const h = [0, 1, 2].map((i) => E[i] + d[i] * t - p.c[i]), ex = rot(p.q, [1, 0, 0]), ez = rot(p.q, [0, 0, 1]);
    if (Math.abs(h[0] * ex[0] + h[1] * ex[1] + h[2] * ex[2]) <= p.hw && Math.abs(h[0] * ez[0] + h[1] * ez[1] + h[2] * ez[2]) <= p.hh) { best = p.k; bestT = t; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [x, z] = onWater(e.clientX, e.clientY);
  hands.set(e.pointerId, { on: true, x, z, ox: x, oz: z, wx: x, wz: z, vx: 0, vz: 0, t: e.timeStamp, sx: e.clientX, sy: e.clientY, t0: e.timeStamp, moved: 0 }); // in the water at once
  wake();
});
canvas.addEventListener('pointermove', (e) => {
  const h = hands.get(e.pointerId);
  if (!h || h.up) {
    if (h || e.pointerType !== 'mouse' || !live) return;
    const k = pick(e.clientX, e.clientY), over = k === held ? -1 : k; // the lifted print is not a target
    if (over !== hover) { hover = over; canvas.classList.toggle('is-pointer', over >= 0); wake(); }
    return;
  }
  const [x, z] = onWater(e.clientX, e.clientY), dt = Math.max((e.timeStamp - h.t) / 1000, .004), k = Math.min(1, dt / .04);
  h.vx += ((x - h.x) / dt - h.vx) * k; h.vz += ((z - h.z) / dt - h.vz) * k;
  h.x = x; h.z = z; h.t = e.timeStamp;
  h.moved = Math.max(h.moved, Math.hypot(e.clientX - h.sx, e.clientY - h.sy));
  wake();
});
const release = (e) => {
  const h = hands.get(e.pointerId);
  if (!h || h.up) return;
  h.up = true; // let go: the next frame finishes its stroke, then forgets it
  if (e.type !== 'pointerup' || h.moved >= 8 || e.timeStamp - h.t0 >= 600) return;
  // a tap: lift the print under it, or drop the lifted one back, or just touch the water
  const k = pick(e.clientX, e.clientY);
  if (k >= 0) { if (k !== held) lift(k); }
  else if (held >= 0) lift(-1);
  else water.dent(h.x, h.z, .045, -.006);
  wake();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (hover >= 0) { hover = -1; canvas.classList.remove('is-pointer'); wake(); } });

addEventListener('keydown', (e) => {
  if (!live) return;
  if (e.key === 'Escape') { if (held >= 0) { e.preventDefault(); lift(-1); } return; }
  const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrow && held >= 0 && arrow[0]) { e.preventDefault(); step(arrow[0]); }
  else if (arrow) { e.preventDefault(); current(arrow); }
  else if (e.key === 'Enter' && held < 0 && !e.target.closest?.('button')) { e.preventDefault(); liftNearest(); }
});

// The arrow keys push a current through the pool: a long swell raised along one wall, and a nudge.
function current([dx, dz]) {
  const [px, pz] = pool;
  if (dx) for (let z = -pz; z <= pz; z += .06) water.dent(-dx * (px - .1), z, .14, .01);
  else for (let x = -px; x <= px; x += .06) water.dent(x, -dz * (pz - .1), .14, .01);
  for (const p of prints) if (p.mode === 2 && !p.out) { p.vx += dx * (.2 + .12 * rand()); p.vz += dz * (.2 + .12 * rand()); p.w += (rand() - .5) * .3; }
  wake();
}
function liftNearest() {
  const [x, z] = onWater(innerWidth / 2, innerHeight / 2);
  let best = -1, bestD = Infinity;
  for (const p of prints) if (p.mode === 2) { const d = Math.hypot(p.x - x, p.z - z); if (d < bestD) { bestD = d; best = p.k; } }
  if (best >= 0) lift(best);
}

// ---------------------------------------------------------------------------
// Lifting a print out of the water
// ---------------------------------------------------------------------------
const caption = $('caption');
function lift(k) {
  const prev = held;
  // stepping, the print going back drops quickly and the next waits a beat, so they never meet
  if (held >= 0 && held !== k) Object.assign(prints[held], { liftTo: 0, g: k >= 0 ? 14 : 8 });
  held = k;
  if (k < 0) {
    caption.hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
    canvas.focus({ preventScroll: true });
    wake();
    return;
  }
  const p = prints[k], photo = photos[p.photo];
  if (queue.includes(p)) queue.splice(queue.indexOf(p), 1); // lifted before it had dropped in
  if (p.mode !== 2) Object.assign(p, { mode: 2, y: 0 });
  if (!p.out) { // the water closes behind it in a ring
    water.dent(p.x, p.z, Math.min(p.hw, p.hh) * .7, .009);
    Object.assign(p, { out: true, vx: 0, vz: 0, w: 0, wet: 1, liftV: Math.max(p.liftV, 0), wait: prev >= 0 && prev !== k ? .22 : 0 });
  }
  p.liftTo = 1;
  $('time').textContent = photo.taken ? photo.taken.slice(11, 16) : '';
  $('time').hidden = !photo.taken;
  $('title').textContent = photo.description;
  $('live').textContent = photo.description;
  caption.hidden = false;
  history.replaceState(null, '', '#' + photo.id);
  // its full file goes into a slot not held by a print still on its way back down
  if (full.some((f) => f.k === k)) return wake();
  const slot = full.find((f) => f.k < 0 || !prints[f.k].out) || full.find((f) => f.k !== prev);
  slot.k = -1;
  fetch(photo.full).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((img) => {
    if (held !== k) return;
    gl.activeTexture(gl.TEXTURE0 + slot.unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    slot.k = k;
    wake();
  }, () => {});
  wake();
}
// previous and next in the order the photographs were taken
function step(dir) {
  const from = held >= 0 ? prints[held].photo : dir > 0 ? -1 : 0, photo = (from + dir + P) % P;
  lift(prints.find((p) => p.photo === photo).k);
}
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('close').onclick = () => lift(-1);
addEventListener('resize', () => { if (layout()) wake(); });

function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
layout();
live = true; // the pool is lit and still; the prints drop in as their photographs arrive
wake();
await loaded;
const linked = photos.findIndex((p) => '#' + p.id === decodeURIComponent(location.hash));
if (linked >= 0) lift(prints.find((p) => p.photo === linked).k);
if (parent !== window) {
  let sent = false;
  const ready = () => { if (!sent) { sent = true; parent.postMessage({ type: 'platform:ready' }, '*'); } };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 200); // frames may be held while the work is off screen
}
