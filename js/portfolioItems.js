import * as THREE from 'three';
import { scene } from './scene.js';
import { createCardTexture, createInsideTexture, createBackTexture } from './textures.js';

// === PORTFOLIO ITEMS ===
// Folded notes tossed on the desk. The cover is hinged on its left edge:
// hover and it peeks open, click and it flips over to show the inside.
// Angles are loose on purpose but stay close enough to the camera's "up" to read.
const W = 4;
const D = 6;
const LEAF = 0.05;

const CARDS = [
    { id: 'about',      number: '01', title: 'about',    note: 'who, what, why',  inside: ["hey, it's derek", 'ml, systems,', 'side quests'], doodle: 'sparkle', position: [-0.6, 5.2],  rotation: -0.22 },
    { id: 'experience', number: '02', title: 'work',     note: "where i've been", inside: ['google, pixel ai', 'okc thunder,', 'citris, athena...'], doodle: 'star',    position: [6.4, 2.6],   rotation: -0.68 },
    { id: 'projects',   number: '03', title: 'projects', note: 'things i made',   inside: ['things i built', 'for fun, mostly', '(9k users tho)'], doodle: 'spiral',  position: [4.2, -4.6],  rotation: -0.36 },
    { id: 'contact',    number: '04', title: 'say hi',   note: 'inbox is open',   inside: ['write back!', 'i reply', 'fast-ish'],                   doodle: 'heart',   position: [-4.8, -3.6], rotation: -0.55 },
];

const OPEN_ANGLE = Math.PI * 0.94;
const PEEK_ANGLE = 0.22;

const ease = t => 1 - Math.pow(1 - t, 3);
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

class NoteCard {
    constructor(card, index, edgeMaterial) {
        this.id = card.id;
        this.rest = { x: card.position[0], z: card.position[1], ry: card.rotation };

        const leaf = new THREE.BoxGeometry(W, LEAF, D);
        const face = map => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });

        // BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z, -z
        this.root = new THREE.Group();
        this.root.userData = { card: this };

        const base = new THREE.Mesh(leaf, [edgeMaterial, edgeMaterial, face(createInsideTexture(card)), edgeMaterial, edgeMaterial, edgeMaterial]);
        base.position.y = LEAF / 2;
        base.castShadow = true;
        base.receiveShadow = true;
        this.root.add(base);

        this.hinge = new THREE.Group();
        this.hinge.position.set(-W / 2, LEAF, 0);
        this.root.add(this.hinge);

        const cover = new THREE.Mesh(leaf, [edgeMaterial, edgeMaterial, face(createCardTexture(card)), face(createBackTexture()), edgeMaterial, edgeMaterial]);
        cover.position.set(W / 2, LEAF / 2 + 0.002, 0);
        cover.castShadow = true;
        cover.receiveShadow = true;
        this.hinge.add(cover);

        // Animation state
        this.hover = 0;
        this.isHovered = false;
        this.openness = 0;
        this.isOpen = false;
        this.intro = 0;
        this.introDelay = 0.35 + index * 0.14;
        this.spin = (index % 2 ? 1 : -1) * (0.5 + Math.random() * 0.3);

        this.root.position.set(this.rest.x, 8, this.rest.z);
        scene.add(this.root);
    }

    open() { this.isOpen = true; }
    close() { this.isOpen = false; }

    update(dt, time) {
        // Tossed onto the desk: drift down, unspin, flutter out
        if (this.intro < 1) {
            this.introDelay -= dt;
            if (this.introDelay <= 0) this.intro = Math.min(1, this.intro + dt / 1.1);
        }
        const fall = ease(this.intro);
        const flutter = (1 - fall) * Math.sin(time * 9 + this.spin * 10) * 0.12;

        this.hover = approach(this.hover, this.isHovered && !this.isOpen ? 1 : 0, 12, dt);
        this.openness = approach(this.openness, this.isOpen ? 1 : 0, 6, dt);

        const lift = this.hover * 0.25 + this.openness * 0.6;
        this.root.position.y = (1 - fall) * 8 + lift;
        this.root.rotation.set(flutter, this.rest.ry + (1 - fall) * this.spin, flutter * 0.7);

        // Cover: closed, peeking, or flipped over with a little overshoot on the way
        const o = this.openness;
        this.hinge.rotation.z = this.hover * PEEK_ANGLE + o * OPEN_ANGLE + Math.sin(o * Math.PI) * 0.12;
    }

    get landed() { return this.intro >= 1; }
}

export function createPortfolioItems() {
    const edge = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.95 });
    return CARDS.map((card, i) => new NoteCard(card, i, edge));
}
