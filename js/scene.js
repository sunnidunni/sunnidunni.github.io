import * as THREE from 'three';

// === SCENE SETUP ===
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
});

// Configure renderer
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Paper all the way to the horizon: background and fog match the floor
export const PAPER = 0xf4f1ea;
scene.background = new THREE.Color(PAPER);
scene.fog = new THREE.Fog(PAPER, 28, 70);

// Set camera position to look at the scene from an angle
camera.position.set(-5, 8, 10);

// === RESPONSIVENESS ===
let postProcessingManager = null;

export function setPostProcessingManager(manager) {
    postProcessingManager = manager;
}

export function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Update post-processing if available
    if (postProcessingManager) {
        postProcessingManager.handleResize();
    }
}

window.addEventListener('resize', handleResize); 