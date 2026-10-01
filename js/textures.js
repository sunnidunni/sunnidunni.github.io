import * as THREE from 'three';
import { renderer } from './scene.js';
import { writeText, doodle, strokeOnCanvas } from './handwriting.js';

// === NOTE TEXTURES ===
// Each portfolio item is a folded note on the desk. The cover is printed (title),
// the inside is handwritten in pencil, the back of the cover is blank stock.

const W = 1024;
const H = 1536;

const ink = {
    card: '#fbfaf6',
    rule: 'rgba(92, 132, 214, 0.22)',
    header: 'rgba(214, 96, 86, 0.55)',
    text: '#1c1b19',
    muted: '#8a857a',
    accent: '#2f4fd6',
};

// Card stock with faint grain and blue rules; optional red header line
function drawStock(ctx, { header = true } = {}) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = ink.card;
    ctx.fillRect(0, 0, W, H);

    // Faint grain so it doesn't read as flat plastic
    const grain = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < grain.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 6;
        grain.data[i] += n;
        grain.data[i + 1] += n;
        grain.data[i + 2] += n;
    }
    ctx.putImageData(grain, 0, 0);

    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 3;
    for (let y = 340; y < H - 80; y += 96) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    if (header) {
        ctx.strokeStyle = ink.header;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 230);
        ctx.lineTo(W, 230);
        ctx.stroke();
    }
}

function drawCard(ctx, { number, title, note }) {
    drawStock(ctx);

    const pad = 96;

    // Header row: number and small label
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink.muted;
    ctx.font = '52px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(number, pad, 170);
    ctx.textAlign = 'right';
    ctx.fillText('derek sun', W - pad, 170);

    // Title
    ctx.textAlign = 'left';
    ctx.fillStyle = ink.text;
    ctx.font = 'italic 260px "Instrument Serif", Georgia, serif';
    ctx.fillText(title, pad - 10, 800);

    // Note
    ctx.fillStyle = ink.muted;
    ctx.font = '62px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(note, pad, 930);

    // Footer
    ctx.fillStyle = ink.accent;
    ctx.font = '64px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('open →', pad, H - 120);
}

function makeTexture(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    draw(ctx);
    return { ctx, texture };
}

// Inside of the note: a few lines in pencil on the rules, and a doodle
function drawInside(ctx, { inside = [], doodle: name = 'star' }) {
    drawStock(ctx, { header: false });

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    inside.forEach((line, i) => {
        ctx.strokeStyle = i === 0 ? ink.accent : 'rgba(52, 50, 46, 0.88)';
        strokeOnCanvas(ctx, writeText(line), 110, 424 + i * 192, 150);
    });

    ctx.strokeStyle = 'rgba(52, 50, 46, 0.75)';
    ctx.lineWidth = 6;
    strokeOnCanvas(ctx, doodle(name, 200, 180), W - 330, H - 360, 1);
}

export function createInsideTexture(content) {
    return makeTexture(ctx => drawInside(ctx, content)).texture;
}

export function createBackTexture() {
    return makeTexture(ctx => drawStock(ctx, { header: false })).texture;
}

export function createCardTexture(content) {
    const { ctx, texture } = makeTexture(ctx => drawCard(ctx, content));

    // Web fonts may still be loading; redraw once they land
    Promise.all([
        document.fonts.load('italic 260px "Instrument Serif"'),
        document.fonts.load('48px "JetBrains Mono"'),
    ]).then(() => {
        drawCard(ctx, content);
        texture.needsUpdate = true;
    }).catch(() => {});

    return texture;
}
