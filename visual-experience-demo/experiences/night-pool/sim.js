// The pool's water and the prints floating on it, in metres and seconds; y is up and the surface is y = 0.
// The water is a height field stepped by the damped wave equation. The prints are stiff cards that slide
// down its slopes, are carried by a hand moving through it, knock into each other and the walls, and settle.
export const CELL = 1 / 32; // one height-field cell, about 3 cm

// Heights u and their rates v on a grid over the pool, stepped at 60 Hz. The walls reflect: a cell past
// the edge mirrors the edge.
export function createWater(px, pz) {
  const nx = Math.round(2 * px / CELL), nz = Math.round(2 * pz / CELL), n = nx * nz;
  const u = new Float32Array(n), v = new Float32Array(n);
  const K = .18, LOSS = .993, LEVEL = .9988; // wave speed² (cells² per step², ripples at about 0.75 m/s), damping, a slow return to level
  const water = { nx, nz, u, motion: 0 };
  water.step = () => {
    let m = 0;
    for (let z = 0; z < nz; z++) {
      const row = z * nx, up = z ? row - nx : row, down = z < nz - 1 ? row + nx : row;
      for (let x = 0; x < nx; x++) {
        const i = row + x;
        const w = (v[i] + K * (u[x ? i - 1 : i] + u[x < nx - 1 ? i + 1 : i] + u[up + x] + u[down + x] - 4 * u[i])) * LOSS;
        v[i] = w;
        if (w > m) m = w; else if (-w > m) m = -w;
      }
    }
    for (let i = 0; i < n; i++) u[i] = (u[i] + v[i]) * LEVEL;
    water.motion = m * 60; // fastest-moving cell, m/s
  };
  // A smooth dent (a < 0) or swell (a > 0) of height a and radius r, both in metres.
  water.dent = (x, z, r, a) => {
    const cx = (x + px) / CELL - .5, cz = (z + pz) / CELL - .5, R2 = (r / CELL) ** 2, reach = Math.ceil(r / CELL * 2.2);
    for (let j = Math.max(0, Math.floor(cz) - reach); j <= Math.min(nz - 1, Math.ceil(cz) + reach); j++) {
      for (let i = Math.max(0, Math.floor(cx) - reach); i <= Math.min(nx - 1, Math.ceil(cx) + reach); i++) {
        const d2 = ((i - cx) ** 2 + (j - cz) ** 2) / R2;
        if (d2 < 4.8) u[j * nx + i] += a * Math.exp(-d2);
      }
    }
  };
  water.height = (x, z) => {
    const gx = Math.min(Math.max((x + px) / CELL - .5, 0), nx - 1.001), gz = Math.min(Math.max((z + pz) / CELL - .5, 0), nz - 1.001);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * nx + ix;
    return (u[i] * (1 - fx) + u[i + 1] * fx) * (1 - fz) + (u[i + nx] * (1 - fx) + u[i + nx + 1] * fx) * fz;
  };
  water.slope = (x, z, e) => [(water.height(x + e, z) - water.height(x - e, z)) / (2 * e), (water.height(x, z + e) - water.height(x, z - e)) / (2 * e)];
  // For drawing: per cell the height, its slope (scaled by gain) and its curvature (the Laplacian).
  water.field = new Float32Array(n * 4);
  water.pack = (gain) => {
    const f = water.field, k = gain / (2 * CELL), c2 = 1 / (CELL * CELL);
    for (let z = 0; z < nz; z++) {
      const row = z * nx, up = z ? row - nx : row, down = z < nz - 1 ? row + nx : row;
      for (let x = 0; x < nx; x++) {
        const i = row + x, l = u[x ? i - 1 : i], r = u[x < nx - 1 ? i + 1 : i], b = u[up + x], t = u[down + x];
        f[i * 4] = u[i]; f[i * 4 + 1] = (r - l) * k; f[i * 4 + 2] = (t - b) * k; f[i * 4 + 3] = (l + r + b + t - 4 * u[i]) * c2;
      }
    }
  };
  return water;
}

// Prints: centre x, z, turn a (local x runs along (cos a, sin a)), their rates vx, vz, w, half sizes hw, hh,
// and bob y / tilt sx, sz that follow the water under them. mode 0: not yet in, 1: falling in (main.js), 2: afloat.
const DRAG = .95, TURN = 1.3;   // the water's drag on gliding and turning, per second (settled in 2-3 s)
const SLOPE = 5;                 // m/s² of slide per unit of water slope
const GRIP = 12, REACH = .24;    // how fast a hand brings the water near it up to its own speed, and how far
const PUSH = 320, GIVE = 13;     // contact with the walls and each other: stiffness (per s²) and damping (per s)
const SPOTS = [[0, 0], [.6, .6], [-.6, .6], [.6, -.6], [-.6, -.6]]; // where a hand takes hold of a print

function push(p, rx, rz, fx, fz) { p.fx += fx; p.fz += fz; p.tq += rx * fz - rz * fx; }

export function stepPrints(prints, water, hands, [PX, PZ], dt, drift) {
  const afloat = prints.filter((p) => p.mode === 2 && !p.out);
  for (const p of afloat) {
    p.c = Math.cos(p.a); p.s = Math.sin(p.a);
    // drag toward the pool's slow circulation (none under reduced motion), and downhill on the waves
    const cx = drift * (-.014 * p.z / PZ + .004 * Math.sin(p.x * 1.3 + p.k)), cz = drift * (.014 * p.x / PX + .004 * Math.cos(p.z * 1.1 + p.k));
    const [gx, gz] = water.slope(p.x, p.z, Math.min(p.hw, p.hh));
    p.fx = (cx - p.vx) * DRAG - SLOPE * gx;
    p.fz = (cz - p.vz) * DRAG - SLOPE * gz;
    p.tq = (drift * p.spin - p.w) * TURN * p.I;
  }
  for (let i = 0; i < afloat.length; i++) {
    const a = afloat[i];
    // a corner past a wall is pushed back, turning the print square to it
    for (let k = 0; k < 4; k++) {
      const lx = k & 1 ? a.hw : -a.hw, lz = k & 2 ? a.hh : -a.hh, rx = lx * a.c - lz * a.s, rz = lx * a.s + lz * a.c;
      const x = a.x + rx, z = a.z + rz, vx = a.vx - a.w * rz, vz = a.vz + a.w * rx, mx = PX - .015, mz = PZ - .015;
      if (x > mx) push(a, rx, rz, -PUSH * (x - mx) - GIVE * Math.max(vx, 0), 0);
      if (x < -mx) push(a, rx, rz, PUSH * (-mx - x) - GIVE * Math.min(vx, 0), 0);
      if (z > mz) push(a, rx, rz, 0, -PUSH * (z - mz) - GIVE * Math.max(vz, 0));
      if (z < -mz) push(a, rx, rz, 0, PUSH * (-mz - z) - GIVE * Math.min(vz, 0));
    }
    for (let j = i + 1; j < afloat.length; j++) {
      const b = afloat[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 > (a.r + b.r) ** 2) continue;
      cornersInto(a, b); cornersInto(b, a);
      // a soft core keeps two crossed prints apart even when no corner of either is inside the other
      const d = Math.sqrt(d2) || 1e-4, core = Math.min(a.hw, a.hh) + Math.min(b.hw, b.hh);
      if (d < core) { const f = PUSH * .4 * (core - d) / d; push(a, 0, 0, -dx * f, -dz * f); push(b, 0, 0, dx * f, dz * f); }
    }
  }
  // a hand in the water carries what floats near it along with it
  for (const h of hands) {
    if (!h.on) continue;
    const ex = h.x - h.px, ez = h.z - h.pz, len2 = ex * ex + ez * ez;
    for (const p of afloat) {
      if (segment2(p.x, p.z, h, ex, ez, len2) > (REACH * 2.4 + p.r) ** 2) continue;
      for (const [fx, fz] of SPOTS) {
        const lx = fx * p.hw, lz = fz * p.hh, rx = lx * p.c - lz * p.s, rz = lx * p.s + lz * p.c;
        const g = GRIP / SPOTS.length * Math.exp(-segment2(p.x + rx, p.z + rz, h, ex, ez, len2) / (REACH * REACH));
        if (g > 1e-3) push(p, rx, rz, g * (h.vx - (p.vx - p.w * rz)), g * (h.vz - (p.vz + p.w * rx)));
      }
    }
  }
  let fastest = 0;
  for (const p of afloat) {
    p.vx += p.fx * dt; p.vz += p.fz * dt; p.w += p.tq / p.I * dt;
    p.x += p.vx * dt; p.z += p.vz * dt; p.a += p.w * dt;
    const speed = Math.hypot(p.vx, p.vz);
    fastest = Math.max(fastest, speed + Math.abs(p.w) * p.r);
    // a print gliding fast pushes up a little water ahead of it
    if (speed > .06) water.dent(p.x + p.vx / speed * p.r * .7, p.z + p.vz / speed * p.r * .7, .09, .00022 * speed);
  }
  // each print rides the water under it: a heavy, damped bob and tilt
  for (const p of prints) {
    if (p.mode === 2 && !p.out) {
      const [gx, gz] = water.slope(p.x, p.z, Math.max(p.hw, p.hh) * .7);
      p.vy += (90 * (water.height(p.x, p.z) - p.y) - 11 * p.vy) * dt; p.y += p.vy * dt;
      p.tvx += (80 * (gx - p.sx) - 12 * p.tvx) * dt; p.sx += p.tvx * dt;
      p.tvz += (80 * (gz - p.sz) - 12 * p.tvz) * dt; p.sz += p.tvz * dt;
      fastest = Math.max(fastest, Math.abs(p.vy) * 4, Math.hypot(p.tvx, p.tvz) * p.r);
    }
  }
  return fastest;
}

// a's corners inside b push the two apart across b's nearer edge, at the corner, so both turn
function cornersInto(a, b) {
  for (let k = 0; k < 4; k++) {
    const lx = k & 1 ? a.hw : -a.hw, lz = k & 2 ? a.hh : -a.hh, rx = lx * a.c - lz * a.s, rz = lx * a.s + lz * a.c;
    const ox = a.x + rx - b.x, oz = a.z + rz - b.z, bx = ox * b.c + oz * b.s, bz = -ox * b.s + oz * b.c;
    const ix = b.hw - Math.abs(bx), iz = b.hh - Math.abs(bz);
    if (ix <= 0 || iz <= 0) continue;
    const [pen, nx, nz] = ix < iz ? [ix, Math.sign(bx) * b.c, Math.sign(bx) * b.s] : [iz, -Math.sign(bz) * b.s, Math.sign(bz) * b.c];
    const vn = (a.vx - a.w * rz - b.vx + b.w * oz) * nx + (a.vz + a.w * rx - b.vz - b.w * ox) * nz;
    const f = PUSH * pen - GIVE * Math.min(vn, 0);
    push(a, rx, rz, f * nx, f * nz);
    push(b, ox, oz, -f * nx, -f * nz);
  }
}

// squared distance from (x, z) to the hand's path since the last step
function segment2(x, z, h, ex, ez, len2) {
  const t = len2 > 1e-10 ? Math.max(0, Math.min(1, ((x - h.px) * ex + (z - h.pz) * ez) / len2)) : 0;
  return (x - h.px - ex * t) ** 2 + (z - h.pz - ez * t) ** 2;
}
