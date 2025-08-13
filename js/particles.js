import * as THREE from 'three';
import { scene } from './scene.js';

// === RETRO PIXELATED PARTICLE SYSTEM ===
export function setupParticles() {
    const particleCount = 80; // More particles for retro feel
    const particles = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        particlePositions[i] = (Math.random() - 0.5) * 100;
        particlePositions[i + 1] = Math.random() * 40;
        particlePositions[i + 2] = (Math.random() - 0.5) * 100;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    // Create retro pixelated particle material
    const particleMaterial = new THREE.PointsMaterial({
        map: createRetroParticleTexture(),
        size: 2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    return particleSystem;
}

// Create retro pixelated particle texture with color theory
function createRetroParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    
    // Disable anti-aliasing for crisp pixels
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Clear canvas
    context.clearRect(0, 0, 16, 16);
    
    // Color theory: Harmonious color palette with good contrast
    const colors = [
        '#f59e0b',  // Amber (warm)
        '#10b981',  // Emerald green (cool)
        '#06b6d4',  // Cyan (cool)
        '#8b5cf6',  // Purple (neutral)
        '#f97316'   // Orange (warm)
    ];
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Draw pixelated particle pattern
    context.fillStyle = color;
    
    // Create a retro pixel art pattern
    const pattern = [
        "  ██  ",
        " ██████ ",
        "████████",
        " ██████ ",
        "  ██  "
    ];
    
    pattern.forEach((row, y) => {
        row.split('').forEach((pixel, x) => {
            if (pixel === '█') {
                context.fillRect(x * 2, y * 2, 2, 2);
            }
        });
    });

    return new THREE.CanvasTexture(canvas);
}

export function animateParticles(particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= 0.08; // Slightly faster for retro feel
        if (positions[i] < -20) {
            positions[i] = 20;
        }
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
} 