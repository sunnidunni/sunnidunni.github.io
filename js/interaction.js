import * as THREE from 'three';
import { camera, renderer } from './scene.js';
import { openSheet, isSheetOpen } from './ui.js';

// === INTERACTION SETUP ===
const DRAG_TOLERANCE = 5; // px; anything more was a pan, not a click
const OPEN_DELAY = 380;   // ms: let the note flip open before the sheet slides in

export function setupInteraction(cards, spotifyLogo = null, dog = null) {
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const roots = cards.map(c => c.root);
    let hovered = null; // 'card' | 'spotify' | 'dog' | null
    let hoveredCard = null;
    let downAt = null;
    let opening = false;

    function cardFrom(object) {
        while (object && !object.userData.card) object = object.parent;
        return object ? object.userData.card : null;
    }

    function pick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const hit = raycaster.intersectObjects(roots, true)[0];
        const card = hit && cardFrom(hit.object);
        if (card && card.landed) return { kind: 'card', card };
        if (spotifyLogo && raycaster.intersectObjects(spotifyLogo.getIntersectable()).length) {
            return { kind: 'spotify' };
        }
        if (dog && raycaster.intersectObjects(dog.getIntersectable(), true).length) {
            return { kind: 'dog' };
        }
        return { kind: null };
    }

    function setHover(hit) {
        const card = hit.kind === 'card' ? hit.card : null;
        if (card !== hoveredCard) {
            if (hoveredCard) hoveredCard.isHovered = false;
            if (card) card.isHovered = true;
            hoveredCard = card;
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

        if (isSheetOpen() || opening || event.target !== canvas) {
            setHover({ kind: null });
            return;
        }
        setHover(pick(event));
    }

    function onPointerDown(event) {
        downAt = { x: event.clientX, y: event.clientY };
    }

    function onClick(event) {
        if (isSheetOpen() || opening || event.target !== canvas) return;
        if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > DRAG_TOLERANCE) return;

        const hit = pick(event);
        if (hit.kind === 'card') {
            opening = true;
            setHover({ kind: null });
            hit.card.open();
            setTimeout(() => {
                opening = false;
                openSheet(hit.card.id);
            }, OPEN_DELAY);
        } else if (hit.kind === 'spotify') {
            spotifyLogo.onClick();
            openSheet('music');
        } else if (hit.kind === 'dog') {
            dog.onClick();
            openSheet('cat');
        }
    }

    // Fold every note back up when the sheet goes away
    document.addEventListener('sheetclose', () => cards.forEach(c => c.close()));

    window.addEventListener('mousemove', onMouseMove, false);
    canvas.addEventListener('pointerdown', onPointerDown, false);
    canvas.addEventListener('click', onClick, false);

    return { raycaster, mouse };
}
