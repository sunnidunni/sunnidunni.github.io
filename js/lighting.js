// lighting.js
import * as THREE from 'three';
import { scene } from './scene.js';

export function setupLighting(renderer) {
    // Physically-based rendering setup
    if (renderer) {
        renderer.physicallyCorrectLights = true;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
    }

    // Hemisphere ambient light (sky + ground)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Strong key light (main light source)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(10, 20, 10);
    keyLight.castShadow = true;

    // Shadow settings for realism
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 100;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.bias = -0.0001;
    scene.add(keyLight);

    // Fill light to soften shadows
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-10, 10, -5);
    scene.add(fillLight);

    // Warm rim light for subtle glow
    const rimLight = new THREE.DirectionalLight(0xffddcc, 0.6);
    rimLight.position.set(-5, 15, -15);
    scene.add(rimLight);
}
