// The night laid out as a 58 mm thermal printer prints it: 384 dots to a line, 32 characters,
// photos dithered to one bit. Rows are counted in the order the printer prints them and drawn
// page by page into an R8 texture array (255 = ink) only when the paper reaches them.
export const DOTS = 80;   // dots per centimetre (203 dpi)
export const WIDTH = 384; // printable dots per line: 48 mm of the 58 mm paper
export const PAGE = 1024; // rows per texture page
const CELL = 12, LINE = 30, COLS = WIDTH / CELL; // characters are 12 × 24 dots, lines 30 dots apart
const LEVELS = 7;         // mipmaps down to 6 × 16
const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const TALL = 1.16;        // receipt type is narrower than a screen monospace
// Before dithering: lift the flash photos' black rooms to a printable grey and keep a few dots in
// the faces; thermal prints are contrasty, solid black slabs are not.
const LIFT = .14, TOP = .95, GAMMA = .92, SHARPEN = .85;
const DAYS = 'SUN MON TUE WED THU FRI SAT'.split(' ');
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');

const pad = (n, w) => String(n).padStart(w, '0');
export const hhmm = (t) => (t ? t.slice(11, 16) : '');
const rule = (c) => c.repeat(COLS);
const center = (s) => ' '.repeat((COLS - s.length) >> 1) + s;
function cols(left, right) {
  const room = COLS - right.length - (right && left ? 1 : 0);
  left = left.slice(0, room);
  return left + ' '.repeat(COLS - left.length - right.length) + right;
}
// Shorten a caption by whole words from the end, a camera from the front (the model says more).
function fit(s, n, fromFront) {
  const w = s.split(' ');
  while (w.length > 1 && w.join(' ').length > n) fromFront ? w.shift() : w.pop();
  return w.join(' ').slice(0, n);
}

export function createReceipt(gl, unit, photos, album) {
  const ops = [];
  let rows = 0;
  // A block is listed top to bottom as it reads on the counter. The printer prints it bottom
  // line first (the paper comes out toward the reader), so its ops are stored in reverse.
  const block = (list) => {
    const start = rows;
    for (let i = list.length; i--;) { list[i].row = rows; rows += list[i].h; ops.push(list[i]); }
    return [start, rows];
  };
  const text = (s, big = 0) => ({ kind: 1, s, big, h: big ? LINE * 2 : LINE });
  const gap = (h) => ({ kind: 0, h });

  const n = photos.length, times = photos.map((p) => hhmm(p.taken)).filter(Boolean);
  const day = album?.date ? new Date(`${album.date}T12:00:00Z`) : null;
  const date = day ? `${DAYS[day.getUTCDay()]} ${pad(day.getUTCDate(), 2)} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}` : '';
  const order = `ORDER ${pad(day ? day.getUTCDate() : n, 4)}`;
  const title = (album?.title || 'Receipt').toUpperCase().slice(0, COLS);
  const head = (extra) => [gap(18), text(title, title.length <= COLS / 2 ? 2 : 1), ...(extra ? [text(center(extra))] : []),
    text(center([date, times[0]].filter(Boolean).join(' · '))), text(cols(order, 'SERVER FLASH')), gap(20)];

  const header = block(head());
  const items = photos.map((p, k) => {
    const time = hhmm(p.taken), idx = pad(k + 1, n > 99 ? 3 : 2);
    const cap = fit(p.description.toUpperCase(), COLS - (time ? time.length + 2 : 0));
    const cam = fit((p.camera || 'Unknown camera').toUpperCase(), COLS - idx.length - 4, true);
    const ph = Math.round(WIDTH / p.aspect), photo = { kind: 2, k, ph, h: ph + 16 };
    const [start, end] = block([gap(44), text(cols(time, cap)), gap(4), photo, text(cols(`${idx}  ${cam}`, '1')), text(rule('-'))]);
    return { k, start, end, photo: [photo.row + 8, photo.row + 8 + ph] };
  });
  const code = `${(album?.date || '').replace(/-/g, '')} ${pad(n, 4)}`.trim();
  const footer = block([
    text(rule('=')), text(cols('PHOTOS', String(n))),
    ...(times.length ? [text(cols('FIRST', times[0])), text(cols('LAST', times[times.length - 1]))] : []),
    text(cols('CAMERAS', String(new Set(photos.map((p) => p.camera).filter(Boolean)).size))),
    text(rule('-')), text(cols('TOTAL', `${n} ITEMS`)), gap(16), { kind: 3, h: 84, code }, text(center(code)),
    gap(14), text(center('THANK YOU · SEE YOU NEXT YEAR')), gap(18), text(rule('-')),
  ]);
  const contd = block([gap(44), text("CONT'D", 2), text(cols(order, date)), gap(16)]);
  const reprint = block(head('* REPRINT *'));

  // What the head prints at each row: 0 nothing, 1 type, 2 an image; and where a line ends
  // (the printer pauses there for its next line).
  const kind = new Uint8Array(rows), lineEnd = new Uint8Array(rows + 1), density = new Float32Array(rows);
  for (const op of ops) {
    kind.fill(op.kind === 1 ? 1 : op.kind ? 2 : 0, op.row, op.row + op.h);
    if (op.kind === 1) lineEnd[op.row + op.h] = 1;
  }

  // ---- texture pages -------------------------------------------------------------------
  const pages = Math.ceil(rows / PAGE);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, LEVELS, gl.R8, WIDTH, PAGE, pages);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, LEVELS - 1);

  const g = Object.assign(document.createElement('canvas'), { width: WIDTH, height: PAGE }).getContext('2d', { willReadFrequently: true });
  g.font = `100px ${FONT}`;
  if (Math.abs(g.measureText('i').width - g.measureText('M').width) > 1) g.font = '100px monospace';
  const family = g.font.replace(/^100px /, ''), size = CELL / (g.measureText('M').width / 100);
  const buf = new Uint8Array(WIDTH * PAGE), drawn = new Uint8Array(pages), dithered = [];

  function draw(p) {
    const r0 = p * PAGE, r1 = r0 + PAGE, here = ops.filter((op) => op.row < r1 && op.row + op.h > r0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, WIDTH, PAGE);
    g.fillStyle = '#000';
    g.textAlign = 'center';
    for (const op of here) {
      if (op.kind !== 1) continue;
      // drawn upright in the op's own frame, flipped into print order (its top row is printed last)
      const sx = op.big === 2 ? 2 : 1, sy = op.big ? 2 : 1, x0 = op.big ? (COLS / sx - op.s.length) * CELL * sx / 2 : 0;
      g.font = `${op.big ? 'bold ' : ''}${size}px ${family}`;
      for (let i = 0; i < op.s.length; i++) {
        if (op.s[i] === ' ') continue;
        g.setTransform(1, 0, 0, -1, 0, op.row + op.h - r0);
        g.translate(x0 + (i + .5) * CELL * sx, 21 * sy);
        g.scale(sx, sy * TALL);
        g.fillText(op.s[i], 0, 0);
      }
    }
    const px = g.getImageData(0, 0, WIDTH, PAGE).data;
    for (let i = 0; i < buf.length; i++) buf[i] = px[i * 4] < 180 ? 255 : 0; // a little heavier than the outline, as thermal type prints
    for (const op of here) {
      if (op.kind === 2 && dithered[op.k]) {
        const src = dithered[op.k];
        for (let y = 0; y < op.ph; y++) {
          const r = op.row + op.h - 9 - y - r0; // 8 dots of paper above the photo
          if (r >= 0 && r < PAGE) buf.set(src.subarray(y * WIDTH, (y + 1) * WIDTH), r * WIDTH);
        }
      } else if (op.kind === 3) bars(op, r0);
    }
    for (let y = 0; y < PAGE && r0 + y < rows; y++) {
      let s = 0;
      for (let x = 0; x < WIDTH; x++) s += buf[y * WIDTH + x];
      density[r0 + y] = s / (255 * WIDTH);
    }
    upload(p);
    drawn[p] = 1;
  }

  // A barcode: Code 128-like modules, two dots each, from the order's digits.
  function bars(op, r0) {
    let h = 0x811c9dc5, x = 0;
    const mods = [2, 1, 1, 2, 1, 4]; // start guard
    for (const ch of op.code + 'xx') for (let j = 0; j < 4; j++) { h = Math.imul(h ^ ch.charCodeAt(0) ^ j, 16777619); mods.push(1 + ((h >>> 13) & 3)); }
    mods.push(2, 3, 3, 1, 1, 1, 2); // stop guard
    const total = mods.reduce((a, b) => a + b, 0) * 2, left = (WIDTH - total) >> 1;
    for (let i = 0; i < mods.length; i++) {
      if (!(i & 1)) for (let y = Math.max(op.row + 6, r0); y < Math.min(op.row + op.h - 6, r0 + PAGE); y++) buf.fill(255, (y - r0) * WIDTH + left + x * 2, (y - r0) * WIDTH + left + (x + mods[i]) * 2);
      x += mods[i];
    }
  }

  function upload(p) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    let w = WIDTH, h = PAGE, src = buf;
    for (let l = 0; l < LEVELS; l++) {
      if (l) {
        const w2 = w >> 1, h2 = h >> 1, dst = new Uint8Array(w2 * h2);
        for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
          const i = 2 * (y * w + x);
          dst[y * w2 + x] = (src[i] + src[i + 1] + src[i + w] + src[i + w + 1] + 2) >> 2;
        }
        src = dst; w = w2; h = h2;
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, l, 0, 0, p, w, h, 1, gl.RED, gl.UNSIGNED_BYTE, src);
    }
  }

  // A decoded thumbnail (RGBA, WIDTH wide) becomes one-bit dots: local contrast, the tone curve,
  // then Atkinson's dither, which lets a quarter of the error go and keeps highlights clean.
  function addPhoto(k, rgba) {
    const w = WIDTH, h = rgba.length / 4 / w, L = new Float32Array(w * h), hist = new Uint32Array(256);
    for (let i = 0; i < L.length; i++) L[i] = (rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114) / 255;
    const B = blur(L, w, h, 3);
    for (let i = 0; i < L.length; i++) { L[i] = Math.min(1, Math.max(0, L[i] + SHARPEN * (L[i] - B[i]))); hist[(L[i] * 255) | 0]++; }
    const at = (q) => { let s = 0, i = 0; while (i < 255 && (s += hist[i]) < q * L.length) i++; return i / 255; };
    const lo = at(.01), hi = Math.max(at(.995), lo + .1);
    for (let i = 0; i < L.length; i++) L[i] = LIFT + (TOP - LIFT) * Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo))) ** GAMMA;
    const out = new Uint8Array(w * h);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      const white = L[i] > .5, e = (L[i] - (white ? 1 : 0)) / 8;
      out[i] = white ? 0 : 255;
      if (x + 1 < w) L[i + 1] += e;
      if (x + 2 < w) L[i + 2] += e;
      if (y + 1 < h) { if (x) L[i + w - 1] += e; L[i + w] += e; if (x + 1 < w) L[i + w + 1] += e; }
      if (y + 2 < h) L[i + 2 * w] += e;
    }
    dithered[k] = out;
    const it = items[k]; // reprint any page already on the paper
    for (let p = (it.photo[0] / PAGE) | 0; p <= ((it.photo[1] - 1) / PAGE | 0); p++) if (drawn[p]) draw(p);
  }

  return {
    tex, rows, kind, lineEnd, density, items, header, footer, contd, reprint, main: [0, footer[1]],
    ensure(c0, c1) { for (let p = Math.max(0, c0 / PAGE | 0); p <= Math.min(pages - 1, c1 / PAGE | 0); p++) if (!drawn[p]) draw(p); },
    ready(c) { const op = c >= 0 && kind[c] === 2 ? ops.find((o) => o.kind === 2 && c >= o.row && c < o.row + o.h) : null; return !op || !!dithered[op.k]; },
    itemAt(c) { for (const it of items) if (c >= it.start && c < it.end) return it; return null; },
    addPhoto,
  };
}

function blur(src, w, h, r) { // a box blur, rows then columns
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? tmp : src, b = pass ? out : tmp, n = pass ? h : w, m = pass ? w : h;
    for (let j = 0; j < m; j++) {
      const at = (i) => a[pass ? Math.min(n - 1, Math.max(0, i)) * w + j : j * w + Math.min(n - 1, Math.max(0, i))];
      let s = 0;
      for (let i = -r; i <= r; i++) s += at(i);
      for (let i = 0; i < n; i++) { b[pass ? i * w + j : j * w + i] = s / (2 * r + 1); s += at(i + r + 1) - at(i - r); }
    }
  }
  return out;
}
