// lighting.js
import * as THREE from 'three';
import { scene } from './scene.js';

// Soft, slightly warm daylight on a desk: one shadow-casting key, gentle fill
export function setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe8e2d4, 1.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff6ea, 1.2);
    keyLight.position.set(8, 22, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.camera.left = -25;
    keyLight.shadow.camera.right = 25;
    keyLight.shadow.camera.top = 25;
    keyLight.shadow.camera.bottom = -25;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.radius = 6;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-10, 10, -5);
    scene.add(fillLight);
}
