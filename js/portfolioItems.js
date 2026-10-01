import * as THREE from 'three';
import { scene } from './scene.js';
import { createCardTexture } from './textures.js';

// === PORTFOLIO ITEMS ===
// Index cards tossed on the desk. Angles are loose on purpose but all
// stay close enough to the camera's "up" that the titles read.
const THICKNESS = 0.12;

const CARDS = [
    { id: 'about',      number: '01', title: 'about',    note: 'who, what, why',   position: [-0.6, 5.2],  rotation: -0.22 },
    { id: 'experience', number: '02', title: 'work',     note: "where i've been",  position: [6.4, 2.6],   rotation: -0.68 },
    { id: 'projects',   number: '03', title: 'projects', note: 'things i made',    position: [4.2, -4.6],  rotation: -0.36 },
    { id: 'contact',    number: '04', title: 'say hi',   note: 'inbox is open',    position: [-4.8, -3.6], rotation: -0.55 },
];

export function createPortfolioItems() {
    const geometry = new THREE.BoxGeometry(4, THICKNESS, 6);
    const edge = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.95 });

    return CARDS.map(card => {
        const face = new THREE.MeshStandardMaterial({
            map: createCardTexture(card),
            roughness: 0.92,
            metalness: 0,
        });
        // BoxGeometry face order: +x, -x, +y (top), -y, +z, -z
        const mesh = new THREE.Mesh(geometry, [edge, edge, face, edge, edge, edge]);
        mesh.position.set(card.position[0], THICKNESS / 2, card.position[1]);
        mesh.rotation.y = card.rotation;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { id: card.id, originalY: THICKNESS / 2 };
        scene.add(mesh);
        return mesh;
    });
}
