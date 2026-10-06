// The paper: a strip of thermal paper 58 mm wide. It leaves the printer's slot over the tear bar,
// drops in front of the printer onto the counter and lies there, its free end rolled up the way
// the roll left it. The printer feeds it a line at a time; a hand pulls it, swings it, tears it.
// Lengths are centimetres; the paper's own positions are dot rows, 80 to the centimetre.
import { DOTS } from './receipt.js';

export const PAPER = 5.8;
// The printer's body runs from its front face (y = 0) back to d. Its top rounds down to the front
// in a shoulder of radius `shoulder`; the slot crosses the shoulder `slot` radians from the top.
export const PRINTER = { w: 8, d: 9.4, h: 3.4, shoulder: 2.8, slot: .244 };
// Out of the slot the paper lies over the shoulder (radius RA, just clear of the tear bar), leaves
// it at OFF, drops and turns onto the counter (radius R2). HUMP is the paper from the slot to the
// counter; SLOT_Y and Z0 are where it comes out, TOUCH where it lands.
const RA = PRINTER.shoulder + .07, EXIT = PRINTER.slot, OFF = 1.15, R2 = 1.2;
export const SLOT_Y = PRINTER.shoulder - RA * Math.sin(EXIT);
const Z0 = PRINTER.h - PRINTER.shoulder + RA * Math.cos(EXIT);
const LA = RA * (OFF - EXIT), LC = R2 * OFF;
const LB = (Z0 + RA * (Math.cos(OFF) - Math.cos(EXIT)) - R2 * (1 - Math.cos(OFF))) / Math.sin(OFF);
export const HUMP = LA + LB + LC;
export const TOUCH = SLOT_Y - RA * (Math.sin(OFF) - Math.sin(EXIT)) - LB * Math.cos(OFF) - R2 * Math.sin(OFF);
const CURL = 3.7, CURL_LEN = 5; // the free end's roll: its whole turn (rad) and the paper in it
const STUB = 1.8, LEAD = 2;       // paper the last customer left out; blank fed before a header
const REST = 5;                    // torn receipts that stay on the counter
const FLOATS = 13;                 // per vertex: centre, across, normal, side, row, tilt, along
const BINS = 48;                   // the roll's height over the counter, sampled along the strip

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const prof = (sig, len) => (sig < len ? (1 - sig / len) ** 2 : 0); // a roll tightening toward the end
function hump(s) {
  if (s < LA) return -EXIT - s / RA;
  if (s < LA + LB) return -OFF;
  return s < HUMP ? -OFF + (s - LA - LB) / R2 : 0;
}

// A centreline from its first sample: x y z, then the tangent's tilt (up from the counter) and turn.
function centre(S, tilt, turn, x, y, z) {
  const C = new Float32Array(S.length * 5);
  let t0 = tilt(S[0]), p0 = turn(S[0]);
  C.set([x, y, z, t0, p0]);
  for (let i = 1; i < S.length; i++) {
    const ds = S[i] - S[i - 1], t1 = tilt(S[i]), p1 = turn(S[i]), t = (t0 + t1) / 2, p = (p0 + p1) / 2;
    x += Math.sin(p) * Math.cos(t) * ds; y -= Math.cos(p) * Math.cos(t) * ds; z = Math.max(0, z + Math.sin(t) * ds);
    C.set([x, y, z, t1, p1], i * 5);
    t0 = t1; p0 = p1;
  }
  return C;
}
// Sample positions: close together where the paper bends, sparse where it lies flat.
function sampling(len, bent) {
  const S = [0];
  for (let s = 0; s < len && S.length < 460;) { s = Math.min(len, s + (bent(s) ? .06 : .45)); S.push(s); }
  return S;
}

export function createPaper(rc, reduced) {
  const P = {
    F: STUB * DOTS, Fprev: STUB * DOTS, v: 0, vs: 0, start: 0, end: STUB * DOTS, spool: [], job: null, glide: null, gv: 0,
    hold: 0, wait: reduced ? 0 : .6, grab: false, swing: 0, swingV: 0, swingTo: 0, curl: 1, curlV: 0, sway: 0, swayV: 0,
    pieces: [], done: false, edge: 1, seed: 7.3, time: 0, latest: -1, strips: [], live: null,
  };
  const queue = (c, n, lead) => { const g = { u: P.end + lead * DOTS, c, n }; P.spool.push(g); P.end = g.u + n; };
  const contentAt = (u) => { for (const g of P.spool) if (u >= g.u && u < g.u + g.n) return g.c + Math.floor(u - g.u); return -1; };
  const tapeOf = (c) => { for (const g of P.spool) if (c >= g.c && c < g.c + g.n) return g.u + c - g.c; return -1; };
  const main = () => P.spool.find((g) => g.c + g.n === rc.main[1]);
  const cutAt = () => { const m = main(); return m ? m.u + m.n + DOTS : Infinity; };

  queue(0, rc.main[1], LEAD);
  P.job = { to: tapeOf(rc.items[0].end - 1) + 1 }; // the header and the first photo
  if (reduced) { P.F = P.job.to; P.job = null; }

  // How fast the head gets through a row: blank paper feeds quickly, type a line at a time, and
  // every black dot of a picture costs heat, so dark rows print slowest.
  function pace(u) {
    const c = contentAt(u);
    if (c < 0 || !rc.kind[c]) return 11 * DOTS;
    return rc.kind[c] === 1 ? 9 * DOTS : 6.5 * DOTS / (1 + 1.3 * rc.density[c]);
  }
  function feed(dt) {
    const to = P.job.to;
    while (dt > 1e-6 && P.F < to) {
      if (P.hold > 0) { const h = Math.min(P.hold, dt); P.hold -= h; dt -= h; continue; }
      if (!rc.ready(contentAt(P.F + 1))) return; // the photo's data has not arrived yet
      const v = pace(P.F);
      let next = Math.min(to, P.F + v * dt);
      for (let u = Math.floor(P.F) + 1; u <= next; u++) {
        const c = contentAt(u - 1);
        if (c >= 0 && rc.lineEnd[c + 1]) { next = u; P.hold = .04; break; } // a line is done: the head steps
      }
      dt -= (next - P.F) / v;
      P.F = next;
    }
    if (P.F >= to) { P.job = null; P.hold = 0; }
  }

  // Detach the paper out of the printer as a receipt of its own. Its top edge is torn on the
  // teeth (1) or cut by the printer (2); it falls flat and slides off to one side of the counter.
  function detach(edge, vx, vy) {
    const L = P.live;
    if (!L) return;
    const side = Math.abs(vx) > 4 ? Math.sign(vx) : P.pieces.length % 2 ? -1 : 1;
    const resting = P.pieces.filter((p) => !p.away), n = resting.filter((p) => p.side === side).length;
    if (resting.length >= REST) Object.assign(resting[0], { away: true, w: 2.5, t: .4, ty: resting[0].y - 70, ta: resting[0].a + resting[0].side * .4 });
    if (P.pieces.length > 8) P.pieces.shift();
    // tossed aside: lying at a slant beside the receipt, each a little further out than the last
    const tx = side * (PAPER * .9 + .7 * (n % 3) + Math.random() * .4), ty = -.2 - .7 * (n % 3) - Math.random() * .4; // just in front of the printer
    const ta = side * (.32 + .13 * (n % 3) + Math.random() * .1);
    // it leaves at the flick's speed, turning with it, and friction stops it where it lies: the
    // quicker the flick, the sooner it gets there
    const w = Math.max(4, Math.min(16, Math.abs(vx) / Math.abs(tx)));
    P.pieces.push({
      rows: P.F - P.start, len: (P.F - P.start) / DOTS, segs: P.spool.map((g) => ({ u: g.u - P.start, c: g.c, n: Math.min(g.n, P.F - g.u) })).filter((g) => g.n > 0 && g.u < P.F - P.start),
      bottom: P.edge, top: edge, seed: Math.random() * 50, S: L.S, snap: L.C, curl: L.curl, t: 0, side,
      x: 0, y: TOUCH + 1.9, a: 0, x0: 0, y0: TOUCH + 1.9, w, tx, ty, ta, away: false,
    });
    if (reduced) Object.assign(P.pieces.at(-1), { t: 1, x: tx, y: ty, a: ta });
    P.start = P.F; P.v = P.gv = 0; P.glide = P.job = null; P.swing = P.swingV = P.swingTo = P.sway = P.swayV = 0;
    P.seed = Math.random() * 50; P.edge = edge;
  }

  function tear(vx, vy) {
    if (P.F - P.start < 1.2 * DOTS || P.done) return false;
    // where the night picks up again: the item the tear went through is printed again whole
    const m = main();
    let c = m && P.F < m.u + m.n ? m.c + Math.max(0, Math.floor(P.F) - m.u) : -1;
    if (c >= 0) { const it = rc.itemAt(c); if (it && c > it.start) c = it.start; if (c < rc.items[0].start) c = rc.items[0].start; if (c > rc.footer[0]) c = rc.footer[0]; }
    detach(1, vx, vy);
    P.spool = []; P.end = P.F;
    queue(rc.contd[0], rc.contd[1] - rc.contd[0], LEAD);
    P.job = { to: P.end };
    if (c >= 0) queue(c, rc.main[1] - c, 0);
    P.wait = reduced ? 0 : .35;
    if (reduced) { P.F = P.job.to; P.job = null; }
    return true;
  }

  function cut() {
    detach(2, (P.pieces.length % 2 ? -1 : 1) * 14, -6);
    P.spool = []; P.end = P.F; P.done = true; P.job = null;
  }

  function pull(d) {
    if (d <= 0) return;
    if (P.done) { // the next pull starts a reprint
      P.done = false; P.spool = []; P.end = P.F;
      queue(rc.reprint[0], rc.reprint[1] - rc.reprint[0], LEAD);
      queue(rc.items[0].start, rc.main[1] - rc.items[0].start, 0);
    }
    P.job = P.glide = null;
    P.F = Math.min(P.F + d, cutAt());
  }

  // ArrowDown and Space: draw out about one photo, the way a hand would, then stop.
  function pullOne() {
    if (P.done) pull(.01);
    const from = P.glide ?? P.F;
    let to = cutAt();
    for (const it of rc.items) { const u = tapeOf(it.end - 1); if (u > from + DOTS) { to = Math.min(to, u + 1); break; } }
    if (!isFinite(to)) return;
    P.job = null; P.glide = to;
    if (reduced) { P.F = to; P.glide = null; }
  }

  function step(dt) {
    P.time += dt;
    if (P.wait > 0) P.wait -= dt;
    else if (P.job && !P.grab) feed(dt);
    if (P.glide != null && !P.grab) { // a critically damped hand
      P.gv += (36 * (P.glide - P.F) - 12 * P.gv) * dt;
      P.F = Math.min(P.glide, P.F + Math.max(0, P.gv) * dt);
      if (P.glide - P.F < .5 && Math.abs(P.gv) < 40) { P.F = P.glide; P.glide = null; P.gv = 0; }
    }
    if (!P.grab && P.v > 0) { // let go: the roll keeps turning a little, then friction stops it
      P.F = Math.min(P.F + P.v * dt, cutAt());
      P.v = Math.max(0, P.v - (P.v * 14 + 26 * DOTS) * dt); // a short glide: a quarter second at most
    }
    const m = main();
    if (m && !P.done) { // into the totals: the printer finishes them by itself and cuts
      if (P.F >= m.u + rc.footer[0] - m.c && !P.job && !P.grab && P.glide == null && !P.v) P.job = { to: cutAt() };
      if (P.F >= cutAt() - .5) cut();
    }
    for (const g of P.spool) { // ink for the rows the head reaches next
      const a = Math.max(g.u, P.start, P.Fprev - 200), b = Math.min(g.u + g.n, P.F + 700);
      if (b > a) rc.ensure(g.c + a - g.u, g.c + b - g.u);
    }
    const c = contentAt(P.F - 1), it = c >= 0 ? rc.itemAt(c) : null;
    if (it && c >= it.photo[0]) P.latest = it.k;

    // secondary motion: snatched, the roll lags and tightens; let go, it opens and settles; the
    // tail sways after a swing; and sliding along the counter it opens a little
    const speed = (P.F - P.Fprev) / dt, vs = P.vs;
    P.vs += (speed - P.vs) * (1 - Math.exp(-dt * 14));
    const acc = (P.vs - vs) / dt / DOTS;
    P.Fprev = P.F;
    const swingV = P.swingV;
    if (P.grab) { // held: the paper follows the hand closely (an exponential follow is stable at any frame rate)
      const was = P.swing;
      P.swing += (P.swingTo - P.swing) * (1 - Math.exp(-dt * 30));
      P.swingV = (P.swing - was) / dt;
    } else { // let go: the strip swings back, damped by the counter
      P.swingTo = 0;
      P.swingV += (-25 * P.swing - 9 * P.swingV) * dt;
      P.swing += P.swingV * dt;
    }
    P.swing = clamp(P.swing, -.35, .35);
    const target = 1 - .2 * smooth(0, 40, P.vs / DOTS);
    if (reduced) { P.curl = 1; P.curlV = P.sway = P.swayV = 0; if (!P.grab) P.swing = P.swingV = 0; }
    else {
      P.curlV += (70 * (target - P.curl) - 10.5 * P.curlV + .0025 * clamp(acc, -900, 900)) * dt; // its weight lags the paper; it settles after one small overshoot
      P.curl = clamp(P.curl + P.curlV * dt, .55, 1.45);
      P.swayV += (-55 * P.sway - 7.5 * P.swayV - .5 * clamp((P.swingV - swingV) / dt, -40, 40)) * dt;
      P.sway = clamp(P.sway + P.swayV * dt, -.5, .5);
    }

    let moving = !!(P.job || P.glide != null || P.v || P.hold > 0 || P.wait > 0 || P.grab);
    moving ||= Math.abs(P.swing) + Math.abs(P.swingV) > 1e-4 || Math.abs(P.curl - target) + Math.abs(P.curlV) > 1e-4 || Math.abs(P.sway) + Math.abs(P.swayV) > 1e-4;
    moving ||= Math.abs(P.vs) > 1;
    for (const p of P.pieces) {
      p.t += dt;
      const f = 1 - Math.exp(-p.w * dt); // friction: it slows in proportion to its speed and never comes back
      let left = 0;
      for (const [k, t] of [['x', 'tx'], ['y', 'ty'], ['a', 'ta']]) { p[k] += (p[t] - p[k]) * f; left += Math.abs(p[t] - p[k]); }
      p.rest = p.t > .4 && left < 2e-3;
      if (p.rest) { p.x = p.tx; p.y = p.ty; p.a = p.ta; }
      moving ||= !p.rest;
    }
    P.pieces = P.pieces.filter((p) => !(p.away && p.t > 1 && p.rest));
    return moving;
  }

  // ---- geometry ------------------------------------------------------------------------
  // The strip still in the printer, out to `clip` cm (the rest is past the bottom of the view).
  function liveShape(clip) {
    const L = (P.F - P.start) / DOTS;
    if (L < .02) return null;
    const flat = Math.max(L - HUMP, 0), lm = Math.min(CURL_LEN, flat) + 1e-3, Tm = CURL * smooth(.3, 6.5, flat) * P.curl;
    const ls = Math.min(L, 2.5) + 1e-3, Ts = .5 * smooth(.2, 2.5, L) * (1 - smooth(HUMP - 2, HUMP + 1, L));
    const S = sampling(Math.min(L, clip), (s) => s < HUMP + .4 || L - s < Math.max(lm, ls) + .4);
    const tilt = (s) => hump(s) + Tm * prof(L - s, lm) + Ts * prof(L - s, ls);
    const turn = (s) => P.swing * smooth(0, HUMP, s) + .035 * Math.sin((s - HUMP) * .31 + 1.1) * smooth(HUMP, HUMP + 6, s) + P.sway * prof(L - s, lm);
    return { S, C: centre(S, tilt, turn, 0, SLOT_Y, Z0), len: L, curl: [Tm, lm] };
  }

  // A torn receipt where it lies: flat, its torn end lifted a little, its old end still rolled;
  // for its first moments it falls from where it was when it came away.
  function pieceShape(p) {
    if (!p.flat) {
      const L = p.len, [Tm, lm] = p.curl, lt = Math.min(1.6, L * .25) + 1e-3;
      p.flat = centre(p.S, (s) => -.35 * prof(s, lt) + Tm * prof(L - s, lm), () => 0, 0, 0, 0);
      let lo = Infinity;
      for (let i = 2; i < p.flat.length; i += 5) lo = Math.min(lo, p.flat[i]);
      for (let i = 2; i < p.flat.length; i += 5) p.flat[i] -= lo;
    }
    // it moves as one from the first moment; its shape settles from how it hung to flat
    const C = new Float32Array(p.flat.length), c = Math.cos(p.a), s = Math.sin(p.a), e = smooth(0, .3, p.t), F = p.flat, Q = p.snap;
    for (let i = 0; i < C.length; i += 5) {
      const lx = Q[i] - p.x0 + (F[i] - Q[i] + p.x0) * e, ly = Q[i + 1] - p.y0 + (F[i + 1] - Q[i + 1] + p.y0) * e;
      C[i] = p.x + lx * c - ly * s; C[i + 1] = p.y + lx * s + ly * c;
      for (let k = 2; k < 5; k++) C[i + k] = Q[i + k] + (F[i + k] - Q[i + k]) * e;
      C[i + 4] += p.a;
    }
    return C;
  }

  // Vertices for every strip, oldest receipt first and the paper in the printer last (on top).
  // Each strip also gets the height of its roll along its length, so the roll can shade the
  // paper beneath it.
  function build(out, yBottom) {
    const strips = [];
    let o = 0;
    const emit = (S, C, len, rows, z, axis, extra) => {
      const first = o / FLOATS, n = S.length, ax = Math.sin(axis), ay = -Math.cos(axis), H = new Float32Array(BINS);
      const along = (k) => (C[k] - C[0]) * ax + (C[k + 1] - C[1]) * ay;
      for (let i = 0; i < n; i++) {
        const a = Math.max(i - 1, 0) * 5, b = Math.min(i + 1, n - 1) * 5, k = i * 5;
        let tx = C[b] - C[a], ty = C[b + 1] - C[a + 1], tz = C[b + 2] - C[a + 2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let bx = Math.cos(C[k + 4]), by = Math.sin(C[k + 4]);
        const d = bx * tx + by * ty;
        bx -= d * tx; by -= d * ty; let bz = -d * tz;
        const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
        const nx = ty * bz - tz * by, ny = tz * bx - tx * bz, nz = tx * by - ty * bx;
        for (const side of [-1, 1]) {
          out.set([C[k], C[k + 1], C[k + 2] + z, bx, by, bz, nx, ny, nz, side, (len - S[i]) * DOTS, C[k + 3], along(k)], o);
          o += FLOATS;
        }
      }
      // the roll: its highest point over each step along the strip, where it lifts off the counter
      let i0 = n - 1;
      while (i0 > 0 && S[n - 1] - S[i0 - 1] < 9 && S[n - 1] >= len - .01) i0--;
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i < n; i++) { const h = along(i * 5); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      const step = (hi - lo) / (BINS - 1) || 1;
      for (let i = i0; i + 1 < n; i++) {
        const h0 = along(i * 5), h1 = along(i * 5 + 5), z0 = C[i * 5 + 2], z1 = C[i * 5 + 7];
        for (let j = Math.ceil((Math.min(h0, h1) - lo) / step); j <= (Math.max(h0, h1) - lo) / step; j++) {
          const t = h1 === h0 ? 0 : (lo + j * step - h0) / (h1 - h0);
          H[j] = Math.max(H[j], z0 + (z1 - z0) * Math.min(1, Math.max(0, t)));
        }
      }
      strips.push({ first, count: n * 2, rows, len, S, C, z, roll: i0 < n - 1 ? [lo, step, BINS, 0] : [0, 1, 0, 0], H, ...extra });
    };
    P.pieces.forEach((p, i) => {
      const C = pieceShape(p), clip = (p.y - yBottom) / Math.max(Math.cos(p.a), .3) + 5;
      let n = p.S.length;
      while (n > 2 && p.S[n - 2] > clip) n--;
      emit(p.S.subarray(0, n), C.subarray(0, n * 5), p.len, p.rows, .004 * (i + 1), p.a,
        { segs: p.segs, head: 4e6, edges: [p.bottom, p.top], seed: [p.seed, p.seed + 3.1], piece: p });
    });
    P.live = liveShape(HUMP + TOUCH - yBottom + 6);
    if (P.live) {
      const L = P.live;
      L.S = Float32Array.from(L.S);
      emit(L.S, L.C, L.len, P.F - P.start, .004 * (P.pieces.length + 1), P.swing,
        { segs: P.spool.map((g) => ({ u: g.u - P.start, c: g.c, n: g.n })), head: P.F - P.start, edges: [P.edge, 0], seed: [P.seed, 0] });
    }
    P.strips = strips;
    return strips;
  }

  // The paper under a ray: which strip, how far along it (dot rows from its free end) and across.
  function pick(o, d) {
    let best = null;
    for (const st of P.strips) {
      const { S, C, len } = st, half = PAPER / 2;
      for (let i = 0; i + 1 < S.length; i++) {
        // skip pieces of strip the ray passes nowhere near
        const k = i * 5, mx = (C[k] + C[k + 5]) / 2 - o[0], my = (C[k + 1] + C[k + 6]) / 2 - o[1], mz = (C[k + 2] + C[k + 7]) / 2 + st.z - o[2];
        const along = mx * d[0] + my * d[1] + mz * d[2], far = Math.hypot(mx - d[0] * along, my - d[1] * along, mz - d[2] * along);
        if (far > half + (S[i + 1] - S[i]) + .1) continue;
        const q = [i, i + 1].flatMap((j) => {
          const k = j * 5, bx = Math.cos(C[k + 4]), by = Math.sin(C[k + 4]);
          return [[C[k] - bx * half, C[k + 1] - by * half, C[k + 2] + st.z], [C[k] + bx * half, C[k + 1] + by * half, C[k + 2] + st.z]];
        });
        for (const [A, B, Cc, flip] of [[q[0], q[1], q[2], 0], [q[3], q[2], q[1], 1]]) {
          const h = ray(o, d, A, B, Cc);
          if (h && (!best || h.t < best.t)) {
            const u = flip ? 1 - h.u : h.u, v = flip ? 1 - h.v : h.v; // across, along
            best = { t: h.t, strip: st, row: (len - (S[i] + (S[i + 1] - S[i]) * v)) * DOTS, x: (u * 2 - 1) * half, p: [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t] };
          }
        }
      }
    }
    return best;
  }
  // Content row printed at a strip's row, or -1 for blank paper.
  const printedAt = (st, row) => { for (const g of st.segs) if (row >= g.u && row < g.u + g.n && row < st.head) return g.c + Math.floor(row - g.u); return -1; };

  // Where a printed photo is (the part of it printed so far), on the newest strip that shows it.
  function photoSpot(k) {
    const it = rc.items[k];
    for (let j = P.strips.length; j--;) {
      const st = P.strips[j], S = st.S, C = st.C;
      for (const g of st.segs) {
        if (it.photo[0] < g.c || it.photo[0] >= g.c + g.n) continue;
        const a = g.u + it.photo[0] - g.c, b = Math.min(g.u + it.photo[1] - g.c, st.head);
        const s = st.len - (a + b) / 2 / DOTS;
        if (b <= a || s < 0 || s > S[S.length - 1] || S.length < 2) continue;
        let i = 0;
        while (i < S.length - 2 && S[i + 1] < s) i++;
        const f = (s - S[i]) / ((S[i + 1] - S[i]) || 1), at = (n) => C[i * 5 + n] + (C[i * 5 + 5 + n] - C[i * 5 + n]) * f;
        return { p: [at(0), at(1), at(2) + st.z], tall: (b - a) / DOTS };
      }
    }
    return null;
  }

  return {
    P, step, build, pick, printedAt, photoSpot, pull, pullOne, tear,
    hold(on) { P.grab = on; if (on) P.v = 0; }, // a hand on the paper stops it; the printer waits until it pulls
    release(v) { P.grab = false; P.v = reduced ? 0 : Math.max(0, Math.min(v, 90 * DOTS)); },
    swingTo(a) { P.swingTo = clamp(a, -.3, .3); if (reduced) P.swing = P.swingTo; },
    get printing() { return !!(P.job || P.wait > 0); },
  };
}

function ray(o, d, a, b, c) { // Möller–Trumbore: hit distance and barycentric u (toward b), v (toward c)
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-9) return null;
  const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
  if (u < 0 || u > 1) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
  return t > 0 ? { t, u, v } : null;
}
