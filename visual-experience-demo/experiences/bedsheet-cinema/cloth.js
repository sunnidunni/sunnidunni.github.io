// The bedsheet as a verlet particle grid: distance constraints along, across and over two
// particles (stretch, shear and bend), pinned at three points on its top edge, kept off the
// wall, and never farther from a pin than the cloth between them allows.
const ITERATIONS = 8;
const DAMPING = .988; // air drag, per 60 Hz step
const THICK = .012; // how close the cloth may come to the wall (z = 0)
const BEND = .34; // cotton's resistance to folding; stiffer still in the hand, so folds there stay round
const REACH = .5; // how far the held point can be carried from where it was taken

export class Cloth {
  constructor({ nx, ny, width, height, top, z, beamY }) {
    Object.assign(this, { nx, ny, width, height, top, z, beamY });
    const n = this.n = nx * ny, dx = width / (nx - 1), dy = height / (ny - 1);
    this.p = new Float32Array(n * 3); // positions
    this.q = new Float32Array(n * 3); // positions one step ago
    this.r = new Float32Array(n * 3); // the surface drawn: positions smoothed a little
    this.nrm = new Float32Array(n * 3);
    this.acc = new Float32Array(n * 3); // the draft, filled in by the caller before each step
    this.uv = new Float32Array(n * 2); // rest coordinates in metres from the top left corner
    this.inv = new Float32Array(n).fill(1); // inverse mass; 0 holds a particle in place
    // Three clothespins, at the corners and the middle, each pinching a little of the hem, so the
    // pins hang closer together than the sheet is wide: the cloth they gather falls in folds that
    // fan down from each pin, and the edge between them keeps a little slack.
    const c = nx >> 1, groups = [[0, 1], [c - 1, c, c + 1], [nx - 2, nx - 1]], half = (c - 2) * dx * .99;
    this.pins = [0, c, nx - 1];
    this.pinX = [-half, 0, half];
    const topX = new Float32Array(nx), sag = new Float32Array(nx);
    groups.forEach((g, n) => g.forEach((k, m) => { topX[k] = this.pinX[n] + (m - (g.length - 1) / 2) * .006; this.inv[k] = 0; }));
    for (const [a, b] of [[1, c - 1], [c + 1, nx - 2]]) for (let i = a + 1; i < b; i++) {
      topX[i] = topX[a] + (topX[b] - topX[a]) * (i - a) / (b - a);
      sag[i] = .05 * Math.sin(Math.PI * (i - a) / (b - a));
    }
    // hung close to how it will hang, with a ripple so it falls into folds rather than lie flat
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      this.uv[k * 2] = i * dx; this.uv[k * 2 + 1] = j * dy;
      const take = Math.min(1, j * dy / .45), x = topX[i] + (i * dx - width / 2 - topX[i]) * take;
      const ripple = (Math.sin(i * 1.7 + j * .3) + Math.sin(j * 2.3 - i * .7)) * .002 + (i & 1 ? .008 : -.008) * (1 - take);
      this.p.set([x, top - j * dy - sag[i] * (1 - take), z + ripple], k * 3);
    }
    this.q.set(this.p);

    const A = [], B = [], K = [];
    const link = (a, b, k) => { A.push(a); B.push(b); K.push(k); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i + 1 < nx) link(k, k + 1, 1);
      if (j + 1 < ny) link(k, k + nx, 1);
      if (i + 1 < nx && j + 1 < ny) { link(k, k + nx + 1, .6); link(k + 1, k + nx, .6); }
      if (i + 2 < nx) link(k, k + 2, BEND);
      if (j + 2 < ny) link(k, k + 2 * nx, BEND);
    }
    this.A = Int32Array.from(A); this.B = Int32Array.from(B); this.K = Float32Array.from(K);
    // the top hem is doubled and carries the whole sheet: its threads get extra passes
    this.hemLinks = Int32Array.from(A.map((a, c) => (a < nx * 4 && K[c] === 1 ? c : -1)).filter((c) => c >= 0));
    this.L = new Float32Array(A.length);
    // It was stored folded in three and in four: the bend across each crease remembers a little
    // of the fold, alternately ridge and valley.
    for (let c = 0; c < A.length; c++) {
      const a = A[c], b = B[c];
      this.L[c] = this.restDist(a, b);
      const across = b - a === 2, down = b - a === 2 * nx, m = across ? a + 1 : a + nx;
      if (across) for (let f = 1; f < 3; f++) if (Math.abs(this.uv[m * 2] - width * f / 3) < dx / 2) this.L[c] *= .965;
      if (down) for (let f = 1; f < 4; f++) if (Math.abs(this.uv[m * 2 + 1] - height * f / 4) < dy / 2) this.L[c] *= .985;
    }
    for (let k = 0; k < n; k++) { // nudged the way each crease folds, so the cloth buckles that way
      const x = this.uv[k * 2], y = this.uv[k * 2 + 1], bump = (d, s) => s * .015 * Math.exp(-((d / .08) ** 2));
      this.p[k * 3 + 2] += bump(x - width / 3, 1) + bump(x - width * 2 / 3, -1) + bump(y - height / 2, 1) + bump(y - height / 4, -1) + bump(y - height * 3 / 4, -1);
    }
    this.q.set(this.p);
    // long-range attachments: the most cloth there is between each particle and each pin
    this.reach = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) for (let j = 0; j < 3; j++) this.reach[k * 3 + j] = this.restDist(k, this.pins[j]) * 1.01;

    // quads split along alternate diagonals, so a fold in either direction bends along the grid
    this.index = new Uint16Array((nx - 1) * (ny - 1) * 6);
    for (let j = 0, o = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++, o += 6) {
      const k = j * nx + i;
      this.index.set((i + j) & 1 ? [k, k + nx, k + nx + 1, k, k + nx + 1, k + 1] : [k, k + nx, k + 1, k + 1, k + nx, k + nx + 1], o);
    }
    this.grab = null;
    // let it fall into its folds before anyone sees it (it goes on settling, slowly, after)
    for (let s = 0; s < 90; s++) this.step(1 / 60);
    this.surface();
  }

  restDist(a, b) { const u = this.uv; return Math.hypot(u[a * 2] - u[b * 2], u[a * 2 + 1] - u[b * 2 + 1]); }

  // One 60 Hz step. Returns the largest distance a particle moved, in metres.
  step(dt, damping = DAMPING) {
    const { p, q, inv, acc, n } = this, dt2 = dt * dt;
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      for (let c = k * 3, e = c + 3; c < e; c++) {
        const v = (p[c] - q[c]) * damping;
        q[c] = p[c];
        p[c] += v + acc[c] * dt2;
      }
      p[k * 3 + 1] -= 9.81 * dt2;
    }
    const g = this.grab;
    if (g) { const c = g.k * 3; q[c] = p[c]; q[c + 1] = p[c + 1]; q[c + 2] = p[c + 2]; p.set(g.target, c); }
    for (let it = 0; it < ITERATIONS; it++) {
      this.relax(it & 1);
      this.hem();
      if (g) this.pinch(g);
      this.collide();
    }
    this.tether();
    if (this.near && (g || this.afterglow-- > 0)) this.repel();
    if (g) p.set(g.target, g.k * 3);
    let moved = 0;
    for (let c = 0; c < n * 3; c++) moved = Math.max(moved, Math.abs(p[c] - q[c]));
    this.surface();
    return moved;
  }

  relax(backward) {
    const { p, inv, A, B, K, L } = this, m = A.length;
    for (let i = 0; i < m; i++) {
      const c = backward ? m - 1 - i : i, a = A[c], b = B[c], wa = inv[a], wb = inv[b], w = wa + wb;
      if (!w) continue;
      const ia = a * 3, ib = b * 3;
      const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-9) continue;
      const s = K[c] * (1 - L[c] / d) / w;
      p[ia] += dx * s * wa; p[ia + 1] += dy * s * wa; p[ia + 2] += dz * s * wa;
      p[ib] -= dx * s * wb; p[ib + 1] -= dy * s * wb; p[ib + 2] -= dz * s * wb;
    }
  }

  // Three more passes over the top hem's threads, which carry the whole sheet.
  hem() {
    const { p, inv, A, B, L, hemLinks } = this, m = hemLinks.length;
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < m; i++) {
      const c = hemLinks[pass & 1 ? m - 1 - i : i], a = A[c], b = B[c], wa = inv[a], wb = inv[b], w = wa + wb;
      if (!w) continue;
      const ia = a * 3, ib = b * 3, dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-9) continue;
      const s = (1 - L[c] / d) / w;
      p[ia] += dx * s * wa; p[ia + 1] += dy * s * wa; p[ia + 2] += dz * s * wa;
      p[ib] -= dx * s * wb; p[ib + 1] -= dy * s * wb; p[ib + 2] -= dz * s * wb;
    }
  }

  // The wall, the beam's face above the sheet and the floor push back; the cloth drags along them.
  collide() {
    const { p, q, n, beamY } = this;
    for (let k = 0; k < n; k++) {
      const c = k * 3, front = p[c + 1] > beamY ? this.z : THICK;
      if (p[c + 2] < front) { p[c + 2] = front; q[c] += (p[c] - q[c]) * .3; q[c + 1] += (p[c + 1] - q[c + 1]) * .3; }
      if (p[c + 1] < .01) p[c + 1] = .01;
    }
  }

  tether() {
    const { p, reach, n, pins, inv } = this;
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      for (let j = 0; j < 3; j++) {
        const a = pins[j] * 3, c = k * 3, dx = p[c] - p[a], dy = p[c + 1] - p[a + 1], dz = p[c + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = reach[k * 3 + j];
        if (d > r) { const s = r / d; p[c] = p[a] + dx * s; p[c + 1] = p[a + 1] + dy * s; p[c + 2] = p[a + 2] + dz * s; }
      }
    }
  }

  // A hand holds a fistful: the particles around the grabbed one are gathered toward it.
  pinch(g) {
    const { p } = this, [x, y, z] = g.target;
    for (const r of g.ring) {
      const c = r.k * 3;
      p[c] += (x + r.ox - p[c]) * r.w; p[c + 1] += (y + r.oy - p[c + 1]) * r.w; p[c + 2] += (z - .015 - p[c + 2]) * r.w;
    }
    p.set(g.target, g.k * 3);
  }

  take(k) {
    const { nx, ny, n, uv, p, A, B, K } = this;
    if (!this.inv[k]) k += nx; // a pin itself stays on the beam: take the cloth just below it
    const ring = [], i0 = k % nx, j0 = (k / nx) | 0, from = (m) => Math.hypot(uv[m * 2] - uv[k * 2], uv[m * 2 + 1] - uv[k * 2 + 1]);
    for (let j = Math.max(0, j0 - 3); j <= Math.min(ny - 1, j0 + 3); j++) for (let i = Math.max(0, i0 - 3); i <= Math.min(nx - 1, i0 + 3); i++) {
      const m = j * nx + i, du = uv[m * 2] - uv[k * 2], dv = uv[m * 2 + 1] - uv[k * 2 + 1], d = Math.hypot(du, dv);
      if (m === k || !this.inv[m] || d > .13) continue;
      ring.push({ k: m, ox: du * .8, oy: -dv * .8, w: .12 * Math.exp(-((d / .08) ** 2)) });
    }
    // in the hand the cotton bunches in round folds rather than sharp creases
    this.stiff = [];
    for (let c = 0; c < A.length; c++) if (K[c] === BEND && from(A[c]) < .3 && from(B[c]) < .3) { this.stiff.push(c); K[c] = .75; }
    this.near = [];
    for (let m = 0; m < n; m++) if (this.inv[m] && from(m) < .45) this.near.push(m);
    this.inv[k] = 0;
    this.grab = { k, ring, start: [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]], target: [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]] };
    return k;
  }

  // Cloth near the hand keeps from passing through itself: particles far apart in the weave but
  // close in space push each other away.
  repel() {
    const { p, uv, near, inv } = this, m = near.length;
    for (let a = 0; a < m; a++) {
      const i = near[a], ci = i * 3;
      for (let b = a + 1; b < m; b++) {
        const j = near[b], cj = j * 3, dx = p[cj] - p[ci], dy = p[cj + 1] - p[ci + 1], dz = p[cj + 2] - p[ci + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 9e-4) continue; // farther than 3 cm
        const ru = uv[i * 2] - uv[j * 2], rv = uv[i * 2 + 1] - uv[j * 2 + 1];
        if (ru * ru + rv * rv < .01) continue; // neighbours in the weave may lie this close
        const wi = inv[i], wj = inv[j];
        if (!(wi + wj)) continue;
        const d = Math.sqrt(d2) || 1e-6, s = (.03 - d) / d / (wi + wj);
        p[ci] -= dx * s * wi; p[ci + 1] -= dy * s * wi; p[ci + 2] -= dz * s * wi;
        p[cj] += dx * s * wj; p[cj + 1] += dy * s * wj; p[cj + 2] += dz * s * wj;
      }
    }
  }

  // Move the held point, but no farther than an arm's pull from where it was taken, and no farther
  // from any pin than the sheet can reach.
  move(x, y, z) {
    const g = this.grab, { p, pins, reach } = this, [sx, sy, sz] = g.start;
    let t = [x, y, Math.max(z, THICK * 2)];
    const far = Math.hypot(t[0] - sx, t[1] - sy, t[2] - sz);
    if (far > REACH) t = t.map((v, i) => g.start[i] + (v - g.start[i]) * REACH / far);
    for (let pass = 0; pass < 3; pass++) for (let j = 0; j < 3; j++) {
      const a = pins[j] * 3, d = Math.hypot(t[0] - p[a], t[1] - p[a + 1], t[2] - p[a + 2]), r = reach[g.k * 3 + j] * 1.03;
      if (d > r) t = t.map((v, i) => p[a + i] + (v - p[a + i]) * r / d);
    }
    g.target = t;
  }

  release() {
    const g = this.grab;
    if (!g) return;
    this.inv[g.k] = 1;
    for (const c of this.stiff) this.K[c] = BEND;
    this.afterglow = 90; // keep the cloth from passing through itself while it swings back
    // let go mid-swing: the cloth keeps the hand's speed, up to a sensible limit
    const c = g.k * 3, v = Math.hypot(this.p[c] - this.q[c], this.p[c + 1] - this.q[c + 1], this.p[c + 2] - this.q[c + 2]), lim = .05;
    if (v > lim) for (let i = c; i < c + 3; i++) this.q[i] = this.p[i] - (this.p[i] - this.q[i]) * lim / v;
    this.grab = null;
  }

  // The surface drawn: each particle eased toward its neighbours (along the edge, on the edge), so a
  // fold reads as cloth rather than as the grid it is simulated on; held points stay exact.
  surface() {
    const { p, r, nrm, nx, ny, inv } = this;
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      const c = k * 3, ex = i === 0 || i === nx - 1, ey = j === 0 || j === ny - 1;
      if (!inv[k] || (ex && ey)) { r[c] = p[c]; r[c + 1] = p[c + 1]; r[c + 2] = p[c + 2]; continue; }
      const a = (ey ? k - 1 : k - nx) * 3, b = (ey ? k + 1 : k + nx) * 3, l = (ex ? k - nx : k - 1) * 3, e = (ex ? k + nx : k + 1) * 3;
      for (let t = 0; t < 3; t++) r[c + t] = p[c + t] * .5 + (ex || ey ? (p[a + t] + p[b + t]) * .25 * (ey ? 1 : 0) + (p[l + t] + p[e + t]) * .25 * (ex ? 1 : 0) : (p[a + t] + p[b + t] + p[l + t] + p[e + t]) * .125);
    }
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      const l = (i > 0 ? k - 1 : k) * 3, e = (i < nx - 1 ? k + 1 : k) * 3, u = (j > 0 ? k - nx : k) * 3, d = (j < ny - 1 ? k + nx : k) * 3;
      const ax = r[d] - r[u], ay = r[d + 1] - r[u + 1], az = r[d + 2] - r[u + 2]; // down the sheet
      const bx = r[e] - r[l], by = r[e + 1] - r[l + 1], bz = r[e + 2] - r[l + 2]; // across it
      const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, s = 1 / (Math.hypot(x, y, z) || 1);
      nrm[k * 3] = x * s; nrm[k * 3 + 1] = y * s; nrm[k * 3 + 2] = z * s;
    }
  }

  // The particle nearest to where a ray first meets the sheet as drawn, or -1.
  raycast(o, d) {
    const { r: p, index } = this;
    let best = Infinity, hit = -1;
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(det) < 1e-12) continue;
      const s = [o[0] - p[a], o[1] - p[a + 1], o[2] - p[a + 2]], f = 1 / det;
      const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
      if (u < 0 || u > 1) continue;
      const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = f * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]);
      if (v < 0 || u + v > 1) continue;
      const dist = f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]);
      if (dist > 0 && dist < best) { best = dist; hit = index[t + (u > v ? (u > 1 - u - v ? 1 : 0) : (v > 1 - u - v ? 2 : 0))]; }
    }
    return hit;
  }
}
