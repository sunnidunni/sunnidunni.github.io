// The pile: every print is a rigid card sliding on the table, on the envelope and on the prints
// beneath it. Friction is sampled at sixteen points under each card, against whatever lies under
// each point, so a card dragged by a corner swings round behind it, cards lying on it ride along
// and cards under it are tugged. Stepped at 240 Hz while anything moves; a still pile costs nothing.
export const G = 981; // cm/s²
const H = 1 / 240;
const GRID = [-.75, -.25, .25, .75];
// What a card slides on: varnished oak, another print's glossy face, the kraft envelope. Each has
// a friction coefficient and a slip speed (cm/s) below which its friction eases off smoothly.
// A print sliding over another grips it less than the table holds that one still, so a pile is
// not bulldozed by every print that crosses it; a finger pressing on a print adds to its grip.
export const OAK = 0, GLOSS = 1, KRAFT = 2;
export const MU = [.28, .2, .45];
const SLIP = [2.5, 11, 2.5];
const STICK = 1.3;          // static friction, relative to sliding friction
const GRIP = .4 / (16 * H);  // the most any one contact may resist per unit of slip, so stacks stay stable
const SPRING = 2000, DAMP = 75; // a finger's hold on a card, per unit mass
// A sweeping hand pushes what it meets (a viscous push that grows with speed) and, pressing a little,
// grips it (a friction that holds even when the hand moves slowly); its top speed in cm/s.
const HAND = 55, HAND_GRIP = 1600, HAND_V = 160, WALL = 700; // and the soft edge of the view

export const bodies = [];
export const order = [];   // bottom to top
export const grabs = new Map(), hands = new Map();
export const view = { x: 40, y: 25 };
let acc = 0, clock = 0, ticks = 0;
const deals = [];

export function addBody(o) {
  const b = {
    x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, hw: 7.6, hh: 5.1, surface: GLOSS, fixed: false, live: true,
    awake: false, idle: 0, carried: false, weight: 1, fly: 0, flyT: 0, ex: 0, ey: 0, et: 0, fx: 0, fy: 0, ft: 0, c: 1, s: 0, mu: MU[OAK], ...o,
  };
  b.I = (b.hw * b.hw + b.hh * b.hh) / 3; // per unit mass
  b.r = Math.hypot(b.hw, b.hh);
  b.sup = new Int16Array(16).fill(-1);
  b.cov = new Uint8Array(16);
  b.load = new Float32Array(16).fill(1);
  b.id = bodies.length;
  bodies.push(b);
  order.push(b.id);
  return b.id;
}

const sample = (b, n, out) => {
  const u = GRID[n & 3] * b.hw, v = GRID[n >> 2] * b.hh;
  out[0] = b.x + u * b.c - v * b.s; out[1] = b.y + u * b.s + v * b.c;
};
export function inside(b, x, y, pad = 0) {
  const dx = x - b.x, dy = y - b.y;
  if (dx * dx + dy * dy > (b.r + pad) ** 2) return false;
  const c = Math.cos(b.a), s = Math.sin(b.a);
  return Math.abs(dx * c + dy * s) <= b.hw + pad && Math.abs(dy * c - dx * s) <= b.hh + pad;
}
// The card (or the envelope) on top at a point of the table.
export function topAt(x, y, pad = 0) {
  for (let k = order.length; k--;) { const b = bodies[order[k]]; if (b.live && inside(b, x, y, pad)) return order[k]; }
  return -1;
}
const raise = (set) => { const kept = order.filter((j) => !set.has(j)), up = order.filter((j) => set.has(j)); order.length = 0; order.push(...kept, ...up); };
export const toTop = (i) => raise(new Set([i]));
export function toBottom(i) { order.splice(order.indexOf(i), 1); order.unshift(i); }
export function wake(b) { if (!b.fixed) { b.awake = true; b.idle = 0; } }

// What lies under each sample point of every card, and (while a hand sweeps) whether it is covered.
const P = [0, 0];
function contacts(sweeping) {
  for (const b of bodies) { b.c = Math.cos(b.a); b.s = Math.sin(b.a); }
  for (let k = 0; k < order.length; k++) {
    const b = bodies[order[k]];
    if (!b.live || b.fixed) continue;
    let mu = 0;
    for (let n = 0; n < 16; n++) {
      sample(b, n, P);
      let sup = -1;
      for (let m = k; m--;) {
        const o = bodies[order[m]], dx = P[0] - o.x, dy = P[1] - o.y;
        if (!o.live || o.fly > 0 || dx * dx + dy * dy > o.r * o.r) continue;
        if (Math.abs(dx * o.c + dy * o.s) <= o.hw && Math.abs(dy * o.c - dx * o.s) <= o.hh) { sup = order[m]; break; }
      }
      b.sup[n] = sup;
      mu += MU[sup < 0 ? OAK : bodies[sup].surface];
      let cov = 0;
      if (sweeping) for (let m = k + 1; m < order.length && !cov; m++) {
        const o = bodies[order[m]], dx = P[0] - o.x, dy = P[1] - o.y;
        if (o.live && !o.fixed && dx * dx + dy * dy < o.r * o.r && Math.abs(dx * o.c + dy * o.s) <= o.hw && Math.abs(dy * o.c - dx * o.s) <= o.hh) cov = 1;
      }
      b.cov[n] = cov;
      // a card resting on one that moves has to move too
      if (!b.awake && sup >= 0 && bodies[sup].awake && Math.hypot(bodies[sup].vx, bodies[sup].vy) + Math.abs(bodies[sup].w) * 8 > .3) wake(b);
    }
    b.mu = mu / 16;
  }
  // every card presses on what is under it with its own weight and the weight of all it carries
  for (const b of bodies) b.weight = 1;
  for (let k = order.length; k--;) {
    const b = bodies[order[k]];
    if (!b.live || b.fixed) continue;
    for (let n = 0; n < 16; n++) { const j = b.sup[n]; if (j >= 0 && !bodies[j].fixed) bodies[j].weight += b.weight / 16; }
  }
}

// Press on a card: it comes to the top together with every card resting on it, so those ride along.
export function grab(id, i, x, y) {
  contacts(false);
  const b = bodies[i], set = new Set([i]);
  for (let k = order.indexOf(i) + 1; k < order.length; k++) {
    const o = bodies[order[k]];
    if (o.live && !o.fixed && o.sup.some((s) => set.has(s))) set.add(order[k]);
  }
  raise(set);
  const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
  grabs.set(id, { i, u: dx * c + dy * s, v: dy * c - dx * s, x, y, vx: 0, vy: 0 });
  for (const j of set) wake(bodies[j]);
}
export function hold(id, x, y, vx, vy) {
  const g = grabs.get(id), h = hands.get(id);
  if (g) Object.assign(g, { x, y, vx, vy });
  if (h) Object.assign(h, { tx: x, ty: y, speed: Math.hypot(vx, vy) }); // the hand moves there over the coming steps
}
export function release(id, max = 150) {
  const g = grabs.get(id);
  if (g) {
    const b = bodies[g.i], v = Math.hypot(b.vx, b.vy);
    if (v > max) { b.vx *= max / v; b.vy *= max / v; }
    b.w = Math.max(-9, Math.min(9, b.w));
    b.load.fill(1);
  }
  grabs.delete(id);
  const h = hands.get(id);
  if (h) h.done = true; // a hand lifted off the table still finishes the path it was making
}
// Press on bare table: a flat hand that pushes whatever it meets.
export function sweep(id, x, y) { hands.set(id, { x, y, px: x, py: y, tx: x, ty: y, vx: 0, vy: 0 }); }

// The cards dealt out of the envelope: each launched at its moment with a velocity and a spin.
export function deal(list) { deals.push(...list); deals.sort((a, b) => a.t - b.t); clock = 0; }
export const dealing = () => deals.length > 0;

export function advance(dt) {
  acc += dt;
  // a sweeping hand follows the finger's path at the finger's speed (at most a hand's), so a slow
  // frame only delays it; one left behind catches up over the next frames
  for (const h of hands.values()) h.v = Math.min(HAND_V, Math.max(h.speed || 0, 20));
  while (acc >= H) {
    acc -= H; clock += H;
    for (const h of hands.values()) {
      const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy), s = h.v * H;
      h.px = h.x; h.py = h.y;
      if (d > s) { h.vx = dx / d * h.v; h.vy = dy / d * h.v; h.x += dx / d * s; h.y += dy / d * s; }
      else { h.vx = dx / H; h.vy = dy / H; h.x = h.tx; h.y = h.ty; }
    }
    while (deals.length && deals[0].t <= clock) launch(deals.shift());
    if (ticks++ % 4 === 0) contacts(hands.size > 0); // what lies under what, sixty times a second
    step();
  }
  for (const [id, h] of hands) if (h.done && h.x === h.tx && h.y === h.ty) hands.delete(id);
  return deals.length > 0 || grabs.size > 0 || hands.size > 0 || bodies.some((b) => b.live && b.awake);
}
function launch(d) {
  const b = bodies[d.i];
  order.splice(order.indexOf(d.i), 1);
  order.splice(d.under >= 0 ? order.indexOf(d.under) : order.length, 0, d.i); // just under the envelope
  Object.assign(b, { live: true, vx: d.vx, vy: d.vy, w: d.w, fly: d.fly || 0, flyT: d.fly || 0 });
  wake(b);
}
// How fast to deal a card so that it glides for fly seconds, then slides to rest dist away.
export const dealSpeed = (dist, fly) => MU[OAK] * G * (Math.sqrt(fly * fly + 2 * dist / (MU[OAK] * G)) - fly);

function step() {
  for (const b of bodies) { b.ex = b.ey = b.et = b.fx = b.fy = b.ft = 0; b.carried = b.held = false; }
  // a finger holding a card by one point: a stiff damped spring there
  for (const g of grabs.values()) {
    const b = bodies[g.i], c = Math.cos(b.a), s = Math.sin(b.a);
    const rx = g.u * c - g.v * s, ry = g.u * s + g.v * c;
    b.held = true;
    const fx = SPRING * (g.x - b.x - rx) + DAMP * (g.vx - b.vx + b.w * ry), fy = SPRING * (g.y - b.y - ry) + DAMP * (g.vy - b.vy - b.w * rx);
    b.ex += fx; b.ey += fy; b.et += rx * fy - ry * fx;
    b.awake = true; b.idle = 0;
    // the fingertip presses a little: the card grips harder close to it, on whatever is beneath
    for (let n = 0; n < 16; n++) b.load[n] = 1 + 5 * Math.exp(-((GRID[n & 3] * b.hw - g.u) ** 2 + (GRID[n >> 2] * b.hh - g.v) ** 2) / 18);
  }
  // a hand sweeping across the table drags the cards it touches along with it, the top ones most
  for (const h of hands.values()) {
    const R = 4.2, sx = h.x - h.px, sy = h.y - h.py, sl = sx * sx + sy * sy || 1, fast = Math.hypot(h.vx, h.vy) > 1;
    for (const b of bodies) {
      if (!b.live || b.fixed) continue;
      const t0 = Math.max(0, Math.min(1, ((b.x - h.px) * sx + (b.y - h.py) * sy) / sl));
      if (Math.hypot(b.x - h.px - sx * t0, b.y - h.py - sy * t0) > b.r + R) continue;
      for (let n = 0; n < 16; n++) {
        sample(b, n, P);
        const t = Math.max(0, Math.min(1, ((P[0] - h.px) * sx + (P[1] - h.py) * sy) / sl));
        const d = Math.hypot(P[0] - h.px - sx * t, P[1] - h.py - sy * t);
        if (d > R) continue;
        const rx = P[0] - b.x, ry = P[1] - b.y, dvx = h.vx - b.vx + b.w * ry, dvy = h.vy - b.vy - b.w * rx;
        const k = (HAND + HAND_GRIP / Math.hypot(Math.hypot(dvx, dvy), 6)) / 16 * Math.min(1, (R - d) / (R * .45)) * (b.cov[n] ? .3 : 1);
        const fx = k * dvx, fy = k * dvy;
        b.ex += fx; b.ey += fy; b.et += rx * fy - ry * fx;
        if (fast && !b.awake) wake(b);
      }
    }
  }
  // the edges of the view are soft walls, so nothing slides out of reach
  for (const b of bodies) {
    if (!b.live || b.fixed || !b.awake) continue;
    const mx = view.x - b.hw * .45, my = view.y - b.hh * .45;
    if (Math.abs(b.x) > mx) { const o = b.x - Math.sign(b.x) * mx; b.ex -= WALL * o + (o * b.vx > 0 ? 30 * b.vx : 0); }
    if (Math.abs(b.y) > my) { const o = b.y - Math.sign(b.y) * my; b.ey -= WALL * o + (o * b.vy > 0 ? 30 * b.vy : 0); }
  }
  // friction at every sample point against what lies beneath it, and the same force back on that
  for (const b of bodies) {
    if (!b.live || b.fixed || !b.awake) continue;
    if (b.fly > 0) { b.fly -= H; continue; } // dealt: still gliding on the air under it
    for (let n = 0; n < 16; n++) {
      sample(b, n, P);
      const rx = P[0] - b.x, ry = P[1] - b.y, j = b.sup[n], o = j >= 0 ? bodies[j] : null;
      let vx = b.vx - b.w * ry, vy = b.vy + b.w * rx, qx = 0, qy = 0;
      const surf = o ? o.surface : OAK;
      if (o && !o.fixed) {
        qx = P[0] - o.x; qy = P[1] - o.y;
        const ox = o.vx - o.w * qy, oy = o.vy + o.w * qx;
        vx -= ox; vy -= oy;
        if (o.awake && ox * ox + oy * oy > .01) b.carried = true;
      }
      const k = Math.min(GRIP, MU[surf] * G / 16 * b.load[n] * b.weight / Math.hypot(Math.hypot(vx, vy), SLIP[surf]));
      const fx = -k * vx, fy = -k * vy;
      b.fx += fx; b.fy += fy; b.ft += rx * fy - ry * fx;
      if (o && !o.fixed) { o.ex -= fx; o.ey -= fy; o.et -= qx * fy - qy * fx; }
    }
  }
  // integrate; a card at rest stays put until pushed harder than static friction allows
  for (const b of bodies) {
    if (!b.live || b.fixed) continue;
    const limit = STICK * b.mu * G * b.weight, slow = Math.hypot(b.vx, b.vy) + Math.abs(b.w) * b.r < .6;
    const stuck = slow && !b.carried && Math.hypot(b.ex, b.ey) < limit && Math.abs(b.et) < limit * b.r * .45;
    if (!b.awake) { if (stuck || (!b.ex && !b.ey)) continue; wake(b); }
    if (stuck) { b.vx = b.vy = b.w = 0; b.idle += H; }
    else {
      b.vx += (b.ex + b.fx) * H; b.vy += (b.ey + b.fy) * H; b.w += (b.et + b.ft) / b.I * H;
      b.x += b.vx * H; b.y += b.vy * H; b.a += b.w * H;
      b.idle = Math.hypot(b.vx, b.vy) + Math.abs(b.w) * b.r < .25 ? b.idle + H : 0;
    }
    if (b.idle > .25 && !b.held) { b.awake = false; b.vx = b.vy = b.w = 0; }
  }
}
