import * as THREE from 'three';
import { scene, renderer } from './scene.js';

// === NOTEBOOK PAPER FLOOR SETUP ===
export function setupFloor() {
    const floorTexture = createNotebookPaperTexture();

    // Infinite notebook paper floor
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000);
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 1,
        metalness: 0,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Lay it flat
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
}

// Quiet ruled paper: warm stock, faint blue rules, one margin line, a little grain.
// No doodles, so the tile repeat doesn't show.
function createNotebookPaperTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const colors = {
        paper: '#f4f1ea',
        rule: 'rgba(92, 132, 214, 0.28)',
        margin: 'rgba(214, 96, 86, 0.35)',
    };

    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, size, size);

    // Paper grain
    const grain = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < grain.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 7;
        grain.data[i] += n;
        grain.data[i + 1] += n;
        grain.data[i + 2] += n;
    }
    ctx.putImageData(grain, 0, 0);

    // Horizontal rules
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 2;
    const spacing = 64;
    for (let y = spacing / 2; y < size; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
    }

    // Margin line
    ctx.strokeStyle = colors.margin;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(160, 0);
    ctx.lineTo(160, size);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    return texture;
}
