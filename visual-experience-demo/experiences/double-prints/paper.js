// Paper drawn once with Canvas 2D: the lab's kraft envelope, and the back of the print in the hand
// (photo paper watermark, the lab printer's dot-matrix line and its purple stamp). Both are
// uploaded as textures by main.js.
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const INK = 'rgba(48, 30, 18, .86)', PEN = 'rgba(28, 52, 128, .9)', PURPLE = '84, 50, 140';

function sheet(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function fibres(g, w, h, n, rand, light, dark) { // short paper fibres, lighter and darker than the stock
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, a = (rand() - .5) * .8, l = 3 + rand() * 14;
    g.strokeStyle = rand() < .5 ? light : dark;
    g.lineWidth = .6 + rand();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
function rand32(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A rubber stamp pressed by hand: every field of type sits a little off its neighbours, the stamp
// rocks so the ink thins toward one end, and flecks of paper show where the ink did not take.
function stamp(g, fields, x, y, size, rot, seed) {
  const rand = rand32(seed), hgt = Math.ceil(size * 1.9);
  const [c, s] = sheet(Math.ceil(size * 30), hgt);
  s.font = `700 ${size}px ${MONO}`;
  let cx = size * .3;
  for (const f of fields) {
    s.save();
    s.translate(cx, size * 1.3 + (rand() - .5) * size * .16);
    s.rotate((rand() - .5) * .05);
    for (const [dx, a] of [[0, .9], [size * .025, .35]]) { s.fillStyle = `rgba(${PURPLE}, ${a})`; s.fillText(f, dx, 0); } // the ink spreads a little
    s.restore();
    cx += s.measureText(f).width + size * (1.2 + rand() * .7);
  }
  s.globalCompositeOperation = 'destination-out';
  const rock = s.createLinearGradient(0, rand() * hgt, cx, rand() * hgt);
  rock.addColorStop(0, `rgba(0, 0, 0, ${rand() * .15})`);
  rock.addColorStop(1, `rgba(0, 0, 0, ${.35 + rand() * .25})`);
  s.fillStyle = rock; s.fillRect(0, 0, cx, hgt);
  for (let i = Math.floor(cx * hgt / 22); i--;) { s.globalAlpha = rand() * .7; s.fillRect(rand() * cx, rand() * hgt, .8 + rand() * 2.4, .8 + rand() * 2.4); }
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = .92; g.drawImage(c, 0, -size * 1.3); g.restore();
}

// The lab printer's line along an edge: the text rasterised large and set again as round dots.
function dots(g, text, x, y, pitch, colour) {
  const big = 28, step = 4, [c, s] = sheet(Math.ceil(text.length * big * .62) + 8, big + 8);
  s.font = `700 ${big}px ${MONO}`; s.fillText(text, 4, big);
  const px = s.getImageData(0, 0, c.width, c.height).data;
  g.fillStyle = colour;
  for (let j = 0; j < c.height; j += step) for (let i = 0; i < c.width; i += step) {
    if (px[((j + 2) * c.width + i + 2) * 4 + 3] < 110) continue;
    g.beginPath(); g.arc(x + i / step * pitch, y + j / step * pitch, pitch * .36, 0, Math.PI * 2); g.fill();
  }
}

// The envelope, mouth on the right, 18 × 12.5 cm at 57 px/cm. Its outline (and the thumb notch at
// the mouth) is cut in the shader; this is only what is printed, ticked and stamped on the kraft.
export function envelopeArt({ title, date, count }) {
  const [c, g] = sheet(1024, 712), rand = rand32(3);
  g.fillStyle = '#b78a58'; g.fillRect(0, 0, 1024, 712);
  const tone = g.createLinearGradient(0, 0, 1024, 712);
  tone.addColorStop(0, '#c49a66'); tone.addColorStop(1, '#a87b4b');
  g.globalAlpha = .55; g.fillStyle = tone; g.fillRect(0, 0, 1024, 712); g.globalAlpha = 1;
  fibres(g, 1024, 712, 2600, rand, 'rgba(236, 206, 160, .16)', 'rgba(92, 58, 28, .14)');
  // the glued fold at the closed end, and the shadow just inside the open mouth
  g.fillStyle = 'rgba(88, 56, 26, .16)'; g.fillRect(0, 0, 54, 712);
  g.fillStyle = 'rgba(255, 236, 200, .12)'; g.fillRect(54, 0, 4, 712);
  const mouth = g.createLinearGradient(1024, 0, 1004, 0);
  mouth.addColorStop(0, 'rgba(60, 36, 14, .45)'); mouth.addColorStop(1, 'rgba(60, 36, 14, 0)');
  g.fillStyle = mouth; g.fillRect(984, 0, 40, 712);

  g.fillStyle = INK; g.strokeStyle = INK;
  g.font = `800 66px ${SANS}`; g.fillText('ONE HOUR PHOTO', 92, 130);
  g.lineWidth = 4; g.beginPath(); g.moveTo(92, 156); g.lineTo(700, 156); g.stroke();
  g.font = `600 22px ${SANS}`; g.fillText('DEVELOPING  ·  PRINTING  ·  ENLARGEMENTS', 94, 194);
  // the order, ticked in ballpoint
  const box = (x, y, label, ticked) => {
    g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(x, y - 30, 32, 32);
    g.font = `700 34px ${SANS}`; g.fillStyle = INK; g.fillText(label, x + 48, y);
    if (ticked) {
      g.strokeStyle = PEN; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + 2, y - 16); g.quadraticCurveTo(x + 10, y - 6, x + 13, y + 2); g.quadraticCurveTo(x + 26, y - 34, x + 46, y - 50); g.stroke();
    }
  };
  box(96, 290, 'SINGLES', false);
  box(380, 290, 'DOUBLES', true);
  g.font = `600 22px ${SANS}`; g.fillStyle = INK;
  g.fillText('SIZE', 96, 362); g.fillText('SURFACE', 290, 362); g.fillText('EXP', 560, 362);
  g.font = `800 50px ${SANS}`;
  g.fillText('4 × 6', 96, 418); g.fillText('GLOSSY', 290, 418); g.fillText(String(count), 560, 418);
  // name and date lines, stamped at the counter in the lab's purple ink
  g.lineWidth = 2; g.strokeStyle = INK;
  g.font = `600 22px ${SANS}`;
  g.fillText('NAME', 96, 520); g.beginPath(); g.moveTo(176, 522); g.lineTo(720, 522); g.stroke();
  g.fillText('DATE', 96, 600); g.beginPath(); g.moveTo(176, 602); g.lineTo(720, 602); g.stroke();
  if (title) stamp(g, [title.toUpperCase()], 186, 512, 40, -.03, 11);
  if (date) stamp(g, date.toUpperCase().split(' '), 186, 592, 36, .012, 12);
  // a small sun for the lab, printed in the corner
  g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 4;
  g.beginPath(); g.arc(842, 112, 26, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    g.beginPath(); g.moveTo(842 + Math.cos(a) * 36, 112 + Math.sin(a) * 36); g.lineTo(842 + Math.cos(a) * 52, 112 + Math.sin(a) * 52); g.stroke();
  }
  return c;
}

// The back of a print: matte paper with the maker's light blue-grey watermark, the lab printer's
// dot-matrix line along one edge, and the counter's stamp (frame, time, which of the two copies).
export function backArt({ portrait, frame, time, copy, date }) {
  const [w, h] = portrait ? [512, 768] : [768, 512], [c, g] = sheet(w, h), seed = frame * 7 + copy, rand = rand32(seed);
  const nn = String(frame).padStart(2, '0');
  g.fillStyle = '#f6f2ea'; g.fillRect(0, 0, w, h);
  fibres(g, w, h, 500, rand, 'rgba(255, 255, 255, .55)', 'rgba(150, 140, 120, .06)');
  g.save();
  g.translate(w / 2, h / 2); g.rotate(-.52);
  g.font = `600 15px ${SANS}`; g.fillStyle = 'rgba(104, 124, 158, .24)';
  const line = 'PHOTO PAPER       '.repeat(9);
  for (let y = -h; y < h; y += 50) g.fillText(line, -w * 1.2 + ((y / 50) & 1) * 92, y);
  g.restore();
  dots(g, `${nn}  ${date}  4X6 GL  ${copy}/2`.toUpperCase(), 24, 18, 1.9, 'rgba(46, 44, 50, .62)');
  stamp(g, ['No ' + nn, time, `${copy}/2`].filter(Boolean), w * .07, h - 70, 31, -.018 - rand() * .02, seed);
  return c;
}
