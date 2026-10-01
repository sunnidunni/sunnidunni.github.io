import * as THREE from 'three';
import { scene } from './scene.js';

// === DUST ===
// A few soft specks drifting in the light. Barely there on purpose.
export function setupParticles() {
    const particleCount = 60;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 60;
        positions[i + 1] = Math.random() * 14;
        positions[i + 2] = (Math.random() - 0.5) * 60;
    }
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        map: createSpeckTexture(),
        color: 0x6b675e,
        size: 0.18,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
    });

    const particleSystem = new THREE.Points(particles, material);
    scene.add(particleSystem);
    return particleSystem;
}

function createSpeckTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
}

export function animateParticles(particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array;
    const t = performance.now() * 0.0003;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] += Math.sin(t + i) * 0.004;
        positions[i + 1] -= 0.006;
        if (positions[i + 1] < 0) positions[i + 1] = 14;
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
}
