import * as THREE from 'three';
import { camera, renderer } from './scene.js';
import { openSheet, isSheetOpen } from './ui.js';

// === INTERACTION SETUP ===
const HOVER_LIFT = 0.35;
const HOVER_SCALE = 1.04;
const DRAG_TOLERANCE = 5; // px; anything more was a pan, not a click

export function setupInteraction(portfolioItems, spotifyLogo = null, dog = null) {
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovered = null; // 'card' | 'spotify' | 'dog' | null
    let hoveredItem = null;
    let downAt = null;

    function pick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const card = raycaster.intersectObjects(portfolioItems)[0];
        if (card) return { kind: 'card', object: card.object };
        if (spotifyLogo && raycaster.intersectObjects(spotifyLogo.getIntersectable()).length) {
            return { kind: 'spotify' };
        }
        if (dog && raycaster.intersectObjects(dog.getIntersectable(), true).length) {
            return { kind: 'dog' };
        }
        return { kind: null };
    }

    function setHover(hit) {
        const item = hit.kind === 'card' ? hit.object : null;
        if (item !== hoveredItem) {
            if (hoveredItem) hoveredItem.userData.hover = 0;
            if (item) item.userData.hover = 1;
            hoveredItem = item;
        }
        if (hit.kind !== hovered) {
            if (spotifyLogo && (hovered === 'spotify' || hit.kind === 'spotify')) {
                spotifyLogo.onHover(hit.kind === 'spotify');
            }
            hovered = hit.kind;
            canvas.style.cursor = hovered ? 'pointer' : '';
        }
    }

    let lastMove = 0;
    function onMouseMove(event) {
        const now = performance.now();
        if (now - lastMove < 16) return; // ~60fps
        lastMove = now;

        if (isSheetOpen() || event.target !== canvas) {
            setHover({ kind: null });
            return;
        }
        setHover(pick(event));
    }

    function onPointerDown(event) {
        downAt = { x: event.clientX, y: event.clientY };
    }

    function onClick(event) {
        if (isSheetOpen() || event.target !== canvas) return;
        if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > DRAG_TOLERANCE) return;

        const hit = pick(event);
        if (hit.kind === 'card') {
            openSheet(hit.object.userData.id);
        } else if (hit.kind === 'spotify') {
            spotifyLogo.onClick();
            openSheet('music');
        } else if (hit.kind === 'dog') {
            dog.onClick();
            openSheet('cat');
        }
    }

    window.addEventListener('mousemove', onMouseMove, false);
    canvas.addEventListener('pointerdown', onPointerDown, false);
    canvas.addEventListener('click', onClick, false);

    return { raycaster, mouse };
}

// Ease cards toward their hover state each frame instead of snapping
export function animateCards(portfolioItems) {
    portfolioItems.forEach(item => {
        const d = item.userData;
        d.h = (d.h || 0) + ((d.hover || 0) - (d.h || 0)) * 0.15;
        item.position.y = d.originalY + d.h * HOVER_LIFT;
        item.scale.setScalar(1 + d.h * (HOVER_SCALE - 1));
    });
}
