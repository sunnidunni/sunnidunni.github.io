import * as THREE from 'three';
import { renderer } from './scene.js';

// === INDEX CARD TEXTURES ===
// Each portfolio item is an index card dropped on the desk:
// warm card stock, a red header rule, faint blue lines, and a big italic title.

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

function drawCard(ctx, { number, title, note }) {
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

    // Ruled lines
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 3;
    for (let y = 340; y < H - 80; y += 96) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    // Red header rule
    ctx.strokeStyle = ink.header;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 230);
    ctx.lineTo(W, 230);
    ctx.stroke();

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

export function createCardTexture(content) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    drawCard(ctx, content);

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
