// === UI: mode switching, the slide-in sheet, and the music player ===
// No three.js in here, so the 2D page works even if the 3D scene never loads.

import { decorate } from './scribble.js';

const root = document.documentElement;
const sheet = document.getElementById('sheet');
const sheetBody = sheet.querySelector('.sheet-body');
const sheetPanel = sheet.querySelector('.sheet-panel');

// --- Mode -------------------------------------------------------------------

let scenePromise = null;

export function getMode() {
    return root.dataset.mode === '3d' ? '3d' : '2d';
}

export function setMode(mode) {
    mode = mode === '3d' ? '3d' : '2d';
    closeSheet();
    root.dataset.mode = mode;
    try { localStorage.setItem('mode', mode); } catch (e) {}
    syncToggle();
    if (mode === '3d') boot3D();
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('modechange', { detail: mode }));
}

function syncToggle() {
    const mode = getMode();
    document.querySelectorAll('.mode-toggle [data-set-mode]').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.setMode === mode));
    });
}

function boot3D() {
    if (scenePromise) return scenePromise;
    root.classList.add('is-loading');
    scenePromise = import('./main.js').catch(err => {
        // CDN down or no WebGL: quietly fall back to the flat page
        console.error('3D scene failed to load', err);
        root.classList.remove('is-loading');
        scenePromise = null;
        setMode('2d');
    });
    return scenePromise;
}

// Called by the scene once it has rendered a few frames
export function sceneReady() {
    root.classList.remove('is-loading');
}

// --- Sheet ------------------------------------------------------------------

let lastFocus = null;
let clearTimer = null;

export function isSheetOpen() {
    return sheet.classList.contains('open');
}

export function openSheet(key) {
    const source =
        document.querySelector(`#flat [data-sheet="${key}"]`) ||
        document.getElementById(`sheet-${key}`)?.content.querySelector('[data-sheet]');
    if (!source) return;

    clearTimeout(clearTimer);
    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    sheetBody.replaceChildren(clone);
    clone.querySelectorAll('[data-player]').forEach(p => playTrack(p, currentTrack));
    decorate(clone);

    lastFocus = document.activeElement;
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('open');
    sheetBody.scrollTop = 0;
    sheetPanel.focus({ preventScroll: true });
}

export function closeSheet() {
    if (!isSheetOpen()) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.dispatchEvent(new CustomEvent('sheetclose'));
    // Empty it after the slide-out so embeds and video stop
    clearTimer = setTimeout(() => sheetBody.replaceChildren(), 400);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

// --- Music ------------------------------------------------------------------

const trackIds = [...document.querySelectorAll('#flat [data-track]')].map(b => b.dataset.track);
let currentTrack = trackIds[Math.floor(Math.random() * trackIds.length)];

function playTrack(player, id) {
    const frame = player.querySelector('iframe');
    const src = `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`;
    if (frame && frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    player.querySelectorAll('[data-track]').forEach(btn => {
        if (btn.dataset.track === id) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
    });
}

document.querySelectorAll('#flat [data-player]').forEach(p => playTrack(p, currentTrack));

// --- Wiring -----------------------------------------------------------------

document.addEventListener('click', event => {
    const modeBtn = event.target.closest('[data-set-mode]');
    if (modeBtn) {
        event.stopPropagation();
        if (modeBtn.dataset.setMode !== getMode()) setMode(modeBtn.dataset.setMode);
        return;
    }

    const track = event.target.closest('[data-track]');
    if (track) {
        currentTrack = track.dataset.track;
        playTrack(track.closest('[data-player]'), currentTrack);
        return;
    }

    if (event.target.closest('[data-close]')) {
        closeSheet();
        return;
    }

    const link = event.target.closest('[data-sheet-link]');
    if (link) {
        const key = link.dataset.sheetLink;
        // In 2D the about link is just an anchor; everything else opens the sheet
        if (getMode() === '3d' || key === 'cat') {
            event.preventDefault();
            openSheet(key);
        }
    }
});

// The cat photo tilts toward the cursor (mouse only, and not with reduced motion)
const calm = matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('pointermove', event => {
    const photo = event.target.closest('.taped');
    if (!photo || event.pointerType !== 'mouse' || calm.matches) return;
    const r = photo.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - 0.5;
    const y = (event.clientY - r.top) / r.height - 0.5;
    photo.classList.add('tilting');
    photo.style.setProperty('--ry', `${x * 14}deg`);
    photo.style.setProperty('--rx', `${-y * 10}deg`);
    photo.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    photo.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
});

document.addEventListener('pointerout', event => {
    const photo = event.target.closest('.taped');
    if (!photo || photo.contains(event.relatedTarget)) return;
    photo.classList.remove('tilting');
    photo.style.setProperty('--rx', '0deg');
    photo.style.setProperty('--ry', '0deg');
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSheet();
});

syncToggle();
decorate(document.getElementById('flat'));
if (getMode() === '3d') boot3D();
