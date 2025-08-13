import * as THREE from 'three';

// === SCENE SETUP ===
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: false, // Disable anti-aliasing for retro pixel look
});

// Configure renderer
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Set scene background to color theory-based dark blue
scene.background = new THREE.Color(0x0f172a); // Deep slate blue that complements the floor

// Remove fog for authentic retro look
// scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

// Set camera position to look at the scene from an angle
camera.position.set(-5, 8, 10);

// === RESPONSIVENESS ===
export function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', handleResize); 