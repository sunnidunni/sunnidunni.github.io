// The room, the ball's mirrors and the light they throw, in metres: y is up and the camera looks
// toward −z. main.js draws all of this on the GPU (its GLSL repeats throwOf); the same arithmetic
// here finds what a tap lands on and frames the camera.
export const ROOM_MIN = [-4, 0, -4], ROOM_MAX = [4, 3.2, 4];
export const BALL = [0, 2.5, -0.3], RADIUS = 0.3;
export const LAMP = [-3.3, 2.85, 0.5]; // a pin spot high on the left, a little in front of the ball
export const EYE = [0, 1.5, 3.2];
export const AIM = unit(BALL.map((b, i) => b - LAMP[i])); // the pin spot's axis, focused to the ball's outline
export const DOME = 0.3; // focal length of each mirror: they are very slightly domed (radius 0.6 m)
export const RINGS = 24;
const PITCH = Math.PI / RINGS; // angle between neighbouring mirrors
export const HALF = RADIUS * PITCH * 0.47; // half a mirror's side, leaving a 6 % joint
export const STRIDE = 12; // floats per mirror: normal, layer, east, 0, crop

// Where on the ball the lamp glints toward the eye: the normal halfway between them.
function glintLatitude() {
  let n = [0, 0, 1];
  for (let i = 0; i < 4; i++) {
    const p = BALL.map((b, k) => b + n[k] * RADIUS);
    const l = unit(LAMP.map((v, k) => v - p[k])), e = unit(EYE.map((v, k) => v - p[k]));
    n = unit(l.map((v, k) => v + e[k]));
  }
  return Math.asin(n[1]);
}

// Rings of square mirrors from the bottom up, one ring passing through the glint so the ball
// twinkles as it turns. Each mirror carries one photo, cropped square around its faces; neighbours
// rarely share one. Glue leaves every mirror a little out of true.
export function mirrors(photos, seed = 5) {
  const rand = mulberry32(seed), P = photos.length;
  const g = glintLatitude(), shift = g - (Math.round((g + Math.PI / 2) / PITCH - .5) + .5) * PITCH + Math.PI / 2;
  const rings = [];
  for (let k = 0; ; k++) {
    const lat = -Math.PI / 2 + (k + .5) * PITCH + shift;
    if (lat > Math.PI / 2 - PITCH) break; // the hanger's cap sits above the last ring
    if (lat < -Math.PI / 2 + PITCH * .3) continue;
    rings.push({ lat, n: Math.max(3, Math.round(2 * Math.PI * Math.cos(lat) / PITCH)), phase: rand() });
  }
  const count = rings.reduce((s, r) => s + r.n, 0), data = new Float32Array(count * STRIDE), photoOf = new Int16Array(count);
  let deck = [], i = 0, below = null;
  const draw = () => { if (!deck.length) deck = shuffle([...Array(P).keys()], rand); return deck.pop(); };
  for (const ring of rings) {
    const row = new Int16Array(ring.n);
    for (let j = 0; j < ring.n; j++, i++) {
      // the photo: not the one beside it, nor the one beneath
      const under = below ? below[Math.floor((j + .5) / ring.n * below.length) % below.length] : -1;
      let p = draw();
      for (let tries = 0; tries < 6 && P > 2 && (p === row[j - 1] || p === under || (j === ring.n - 1 && p === row[0])); tries++) { deck.unshift(p); p = draw(); }
      row[j] = photoOf[i] = p;
      // the mirror's frame, tilted a little by its glue
      const lon = 2 * Math.PI * (j + ring.phase) / ring.n, cl = Math.cos(ring.lat), sl = Math.sin(ring.lat);
      let n = [cl * Math.sin(lon), sl, cl * Math.cos(lon)], e = [Math.cos(lon), 0, -Math.sin(lon)];
      const north = cross(n, e), a = (rand() - .5) * .024, b = (rand() - .5) * .024, twist = (rand() - .5) * .06;
      n = unit(n.map((v, k) => v + e[k] * a + north[k] * b));
      const e1 = unit(e.map((v, k) => v - n[k] * dot(e, n))), n1 = cross(n, e1);
      e = e1.map((v, k) => v * Math.cos(twist) + n1[k] * Math.sin(twist));
      // a square crop centred on the faces, sometimes a little closer
      const asp = photos[p].aspect, zoom = 1 + rand() * rand() * .3, [fx, fy] = photos[p].focus || [.5, .5];
      const cw = Math.min(1, 1 / asp) / zoom, ch = Math.min(1, asp) / zoom;
      const u0 = Math.min(Math.max(fx - cw / 2, 0), 1 - cw), v0 = Math.min(Math.max(fy - ch / 2, 0), 1 - ch);
      data.set([...n, p, ...e, 0, u0, v0, u0 + cw, v0 + ch], i * STRIDE);
    }
    below = row;
  }
  return { count, data, photoOf };
}

// The light one mirror throws with the ball turned by theta: the lamp, mirrored in the tile's
// plane and pulled close by its dome, is a virtual source V behind it; the beam through the
// tile's four corners lands on the first room plane its centre ray meets. Fills `out` and
// returns false when the mirror faces away from the lamp. `throwOf` in shaders.js matches it.
export function throwOf(data, i, theta, out) {
  const c = Math.cos(theta), s = Math.sin(theta), b = i * STRIDE;
  const nx = c * data[b] + s * data[b + 2], ny = data[b + 1], nz = c * data[b + 2] - s * data[b];
  const ex = c * data[b + 4] + s * data[b + 6], ey = data[b + 5], ez = c * data[b + 6] - s * data[b + 4];
  const ux = ny * ez - nz * ey, uy = nz * ex - nx * ez, uz = nx * ey - ny * ex;
  const C = [BALL[0] + nx * RADIUS, BALL[1] + ny * RADIUS, BALL[2] + nz * RADIUS];
  const lx = LAMP[0] - C[0], ly = LAMP[1] - C[1], lz = LAMP[2] - C[2], k = lx * nx + ly * ny + lz * nz;
  out.normal = [nx, ny, nz]; out.east = [ex, ey, ez]; out.north = [ux, uy, uz]; out.centre = C;
  if (k <= 0) return false;
  const dL = Math.hypot(lx, ly, lz), dv = DOME * dL / (DOME + dL);
  const mx = lx - 2 * k * nx, my = ly - 2 * k * ny, mz = lz - 2 * k * nz, ml = Math.hypot(mx, my, mz);
  const V = [C[0] + mx / ml * dv, C[1] + my / ml * dv, C[2] + mz / ml * dv], d = [-mx / ml, -my / ml, -mz / ml];
  let axis = 0, t = Infinity;
  for (let a = 0; a < 3; a++) {
    const ta = ((d[a] > 0 ? ROOM_MAX[a] : ROOM_MIN[a]) - C[a]) / d[a];
    if (ta < t) { t = ta; axis = a; }
  }
  const value = d[axis] > 0 ? ROOM_MAX[axis] : ROOM_MIN[axis], q = out.q || (out.q = new Float64Array(12)), sc = out.s || (out.s = new Float64Array(4));
  for (let j = 0; j < 4; j++) {
    const cx = j === 1 || j === 2 ? 1 : -1, cy = j >= 2 ? 1 : -1; // corners go round: (−,−) (+,−) (+,+) (−,+)
    const px = C[0] + (ex * cx + ux * cy) * HALF - V[0], py = C[1] + (ey * cx + uy * cy) * HALF - V[1], pz = C[2] + (ez * cx + uz * cy) * HALF - V[2];
    const f = (value - V[axis]) / [px, py, pz][axis];
    q[j * 3] = V[0] + px * f; q[j * 3 + 1] = V[1] + py * f; q[j * 3 + 2] = V[2] + pz * f; sc[j] = f;
  }
  const m = (dv + t) / dv, beam = smoothstep(1, .8, Math.hypot(ny * AIM[2] - nz * AIM[1], nz * AIM[0] - nx * AIM[2], nx * AIM[1] - ny * AIM[0]));
  Object.assign(out, { axis, value, t, m, dir: d, V, lit: k / dL, gain: beam * Math.abs(d[axis]) / (m * m), hit: C.map((v, a) => v + d[a] * t) });
  return true;
}

// The camera: at home, near the front wall looking a little up at the ball, with a wider view on
// narrow screens; drawn toward the back wall (by c, 0–1) to look at a caught photo of size w × h,
// as near as fits it in, but never so near that the ball (and its light crossing to the picture)
// leaves the top of the view.
export const PROJECTION = { y: 1.66, h: 2.75, w: 4.8 };
export function camera(aspect, c = 0, photoAspect = 1.5) {
  const tan = Math.max(.554, .388 / aspect);
  const homePitch = Math.atan2(BALL[1] - EYE[1], EYE[2] - BALL[2]) - Math.atan(.36 * tan);
  const h = Math.min(PROJECTION.h, PROJECTION.w / photoAspect), w = h * photoAspect;
  const pitchAt = (dist) => Math.atan2(PROJECTION.y - EYE[1], dist) + Math.atan(.12 * tan); // the picture a little below the middle
  const ballAt = (dist) => Math.tan(Math.atan2(BALL[1] - EYE[1], ROOM_MIN[2] + dist - BALL[2]) - pitchAt(dist)) / tan;
  let dist = Math.max(h / (.55 * 2 * tan), w / (.86 * 2 * tan * aspect));
  while (dist < EYE[2] - ROOM_MIN[2] && (ROOM_MIN[2] + dist <= BALL[2] + .3 || ballAt(dist) > .74)) dist += .05;
  dist = Math.min(dist, EYE[2] - ROOM_MIN[2]);
  const pitch = homePitch + (pitchAt(dist) - homePitch) * c;
  const eye = [0, EYE[1], EYE[2] + (ROOM_MIN[2] + dist - EYE[2]) * c];
  const f = [0, Math.sin(pitch), -Math.cos(pitch)], r = [1, 0, 0], u = cross(r, f);
  return { eye, f, r, u, tan, aspect, rect: { w, h } };
}

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function unit(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function shuffle(a, rand) { for (let i = a.length; i > 1;) { const j = (rand() * i--) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
