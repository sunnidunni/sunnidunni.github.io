// === SCRIBBLES ===
// Handwritten notes and doodles on the flat page and in the sheet.
//   <span data-hand="the new one"></span>     writes text
//   <span data-doodle="circle"></span>         draws a doodle sized to the element
//   <mark class="hl">...</mark>                 highlighter swipe
// Things are written when they scroll into view, one at a time, by a small pencil
// that travels between them.

import { writeText, doodle, bounds } from './handwriting.js';

const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPEED = 420;      // px of line per second
const HOP = 260;        // ms for the pencil to travel between notes

// --- rendering --------------------------------------------------------------

const pathData = strokes => strokes
    .map(s => 'M' + s.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join(' L'))
    .join(' ');

function render(el) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    let strokes, strokeWidth;

    if (el.dataset.hand !== undefined) {
        const em = parseFloat(getComputedStyle(el).fontSize) * 2;
        strokes = writeText(el.dataset.hand);
        const b = bounds(strokes);
        const pad = 0.12;
        svg.setAttribute('viewBox', `${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
        svg.setAttribute('width', ((b.width + pad * 2) * em).toFixed(1));
        svg.setAttribute('height', ((b.height + pad * 2) * em).toFixed(1));
        strokeWidth = 1.5 / em;
        el.setAttribute('aria-label', el.dataset.hand);
        el.setAttribute('role', 'img');
    } else {
        // Layout size, not the on-screen box: the sheet may still be mid-swing (3D transform)
        const w = el.offsetWidth || 40, h = el.offsetHeight || 40;
        strokes = doodle(el.dataset.doodle, w, h, el.dataset.dir);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        strokeWidth = parseFloat(el.dataset.weight || 1.5);
    }

    const paths = strokes.map(s => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', pathData([s]));
        p.setAttribute('stroke-width', strokeWidth);
        svg.appendChild(p);
        return p;
    });

    el.replaceChildren(svg);
    return { el, svg, paths };
}

// --- the pencil ----------------------------------------------------------------

let pencil = null;
function getPencil() {
    if (pencil) return pencil;
    pencil = document.createElement('div');
    pencil.className = 'pencil2d';
    pencil.setAttribute('aria-hidden', 'true');
    // Drawn pointing straight down with the tip at (0, 0), then leaned like it's in a right hand
    pencil.innerHTML = `
        <svg viewBox="-12 -92 64 96" width="64" height="96">
            <g transform="rotate(28)">
                <path d="M-5 -84 h10 v8 h-10 z" fill="#e88aa0"/>
                <path d="M-5.5 -76 h11 v6 h-11 z" fill="#bfbab0"/>
                <path d="M-5 -70 h10 v56 h-10 z" fill="#efb84f"/>
                <path d="M-1.6 -70 h3.2 v56 h-3.2 z" fill="#e0a43b"/>
                <path d="M-5 -14 L5 -14 L1.2 -2.5 L-1.2 -2.5 z" fill="#f0d9b5"/>
                <path d="M-1.2 -2.5 L1.2 -2.5 L0 0 z" fill="#2f2f2f"/>
            </g>
        </svg>`;
    document.body.appendChild(pencil);
    return pencil;
}

function placePencil(x, y) {
    getPencil().style.transform = `translate(${x}px, ${y}px)`;
}

function pointOnScreen(svg, path, length) {
    const pt = path.getPointAtLength(length);
    const m = path.getScreenCTM();
    return m ? new DOMPoint(pt.x, pt.y).matrixTransform(m) : { x: 0, y: 0 };
}

// --- queue -------------------------------------------------------------------

const queue = [];
let busy = false;
let parkTimer = null;

function prepare(job) {
    job.lengths = job.paths.map(p => p.getTotalLength());
    job.paths.forEach((p, i) => {
        p.style.strokeDasharray = `${job.lengths[i]} ${job.lengths[i]}`;
        p.style.strokeDashoffset = reduceMotion ? 0 : job.lengths[i];
    });
}

function enqueue(job) {
    prepare(job);
    if (reduceMotion) return;
    queue.push(job);
    if (!busy) next();
}

function next() {
    const job = queue.shift();
    if (!job) {
        busy = false;
        clearTimeout(parkTimer);
        parkTimer = setTimeout(() => pencil && pencil.classList.remove('on'), 500);
        return;
    }
    if (!job.el.isConnected) return next();
    busy = true;
    clearTimeout(parkTimer);

    const p = getPencil();
    // Sit above the sheet only when writing inside it; otherwise stay under its scrim
    p.classList.toggle('in-sheet', !!job.el.closest('.sheet'));
    // Hop over to where this one starts, then write
    const start = pointOnScreen(job.svg, job.paths[0], 0);
    const wasOn = p.classList.contains('on');
    p.classList.add('on', 'hopping');
    if (!wasOn) {
        p.style.transition = 'none';
        placePencil(start.x + 30, start.y - 20);
        p.getBoundingClientRect();
        p.style.transition = '';
    }
    placePencil(start.x, start.y);
    setTimeout(() => {
        p.classList.remove('hopping');
        write(job);
    }, HOP);
}

function write(job) {
    const p = getPencil();
    const total = job.lengths.reduce((a, b) => a + b, 0);
    let last = performance.now();
    let done = 0;
    p.style.transition = 'none';

    function frame(now) {
        if (!job.el.isConnected) { p.style.transition = ''; return next(); }
        done = Math.min(total, done + ((now - last) / 1000) * SPEED);
        last = now;

        let left = done;
        let tip = null;
        job.paths.forEach((path, i) => {
            const len = job.lengths[i];
            const drawn = Math.max(0, Math.min(len, left));
            path.style.strokeDashoffset = len - drawn;
            if (!tip && left <= len) tip = pointOnScreen(job.svg, path, drawn);
            left -= len;
        });
        if (tip) placePencil(tip.x, tip.y);

        if (done < total) requestAnimationFrame(frame);
        else {
            p.style.transition = '';
            job.el.classList.add('written');
            next();
        }
    }
    requestAnimationFrame(frame);
}

// --- wiring ------------------------------------------------------------------

const observer = new IntersectionObserver(entries => {
    entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .forEach(e => {
            observer.unobserve(e.target);
            if (e.target.classList.contains('hl')) {
                e.target.classList.add('in');
                return;
            }
            enqueue(render(e.target));
        });
}, { threshold: 0.6 });

// Call on the page once, and on every fresh copy put into the sheet
export function decorate(root) {
    root.querySelectorAll('[data-hand], [data-doodle], .hl').forEach(el => {
        el.classList.remove('written', 'in');
        if (!el.classList.contains('hl')) el.replaceChildren();
        observer.observe(el);
    });
}
