import * as THREE from 'three';

// === 3D PENCIL ===
// Follows the cursor, leaning like it's in a right hand. It hovers a little above
// the paper and presses down when drawing (right-click). It can also take over
// and write on its own: see write().

const UP = new THREE.Vector3(0, 1, 0);
const HOVER_HEIGHT = 0.45;
const INK = 0x34322e;

export class PencilCursor {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.mouse = new THREE.Vector2(0, -0.2);
        this.raycaster = new THREE.Raycaster();
        this.ground = new THREE.Plane(UP, 0);
        this.target = new THREE.Vector3();
        this.tip = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lift = 1;

        this.isDrawing = false;
        this.traces = [];
        this.currentTrace = null;

        this.job = null; // autopilot writing

        this.createPencil();
        this.computeLean();
        this.setupEventListeners();
        this.aimAtMouse();
        this.tip.copy(this.target);
    }

    createPencil() {
        const model = new THREE.Group();

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0xdeb887, map: this.createWoodTexture() })
        );
        body.position.y = 4;
        model.add(body);

        const ferrule = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.8, 12),
            new THREE.MeshStandardMaterial({ color: 0xbfbab0, metalness: 0.7, roughness: 0.35 })
        );
        model.add(ferrule);

        const eraser = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12),
            new THREE.MeshLambertMaterial({ color: 0xe88aa0 })
        );
        eraser.position.y = -0.4;
        model.add(eraser);

        // Sharpened wood cone, then the graphite point
        const wood = new THREE.Mesh(
            new THREE.ConeGeometry(0.2, 0.75, 6),
            new THREE.MeshLambertMaterial({ color: 0xf0d9b5 })
        );
        wood.position.y = 8.375;
        model.add(wood);

        const lead = new THREE.Mesh(
            new THREE.ConeGeometry(0.07, 0.25, 8),
            new THREE.MeshLambertMaterial({ color: 0x2f2f2f })
        );
        lead.position.y = 8.875;
        model.add(lead);

        model.traverse(o => { if (o.isMesh) o.castShadow = true; });

        // Flip so the point faces down, then shift so the point sits at the holder's origin.
        // The holder pivots at the tip, which is what makes leaning look right.
        model.rotation.z = Math.PI;
        model.position.y = 9.0;
        model.scale.setScalar(0.8);
        model.position.y *= 0.8;

        this.holder = new THREE.Group();
        this.holder.add(model);
        this.scene.add(this.holder);
    }

    createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 64, 0);
        gradient.addColorStop(0, '#d9a441');
        gradient.addColorStop(0.5, '#f2c25a');
        gradient.addColorStop(1, '#c98f2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 256);
        // Painted hex faces
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        for (let i = 0; i < 6; i += 2) ctx.fillRect((i / 6) * 64, 0, 64 / 6, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    // Screen-aligned directions on the desk: right, and "up the page" (away from camera)
    computeLean() {
        const f = new THREE.Vector3();
        this.camera.getWorldDirection(f);
        f.y = 0;
        f.normalize();
        this.forward = f;
        this.right = new THREE.Vector3(-f.z, 0, f.x);
        // Top of the pencil tips toward the bottom-right of the screen
        this.leanDir = this.right.clone().multiplyScalar(0.9).addScaledVector(f, -0.35).normalize();
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousemove', (event) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        });

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 2 && !this.job) this.startDrawing();
        });

        // Right-click draws, so keep the browser menu out of the way
        canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        canvas.addEventListener('mouseup', () => this.stopDrawing());
        canvas.addEventListener('mouseleave', () => this.stopDrawing());
    }

    aimAtMouse() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.ground, hit)) this.target.copy(hit);
    }

    // Where a point on screen (NDC) lands on the desk
    groundAt(ndcX, ndcY) {
        this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
        const hit = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.ground, hit);
        return hit;
    }

    // --- freehand doodling --------------------------------------------------

    startDrawing() {
        this.isDrawing = true;
        this.currentTrace = { last: this.tip.clone(), segments: [] };
        this.traces.push(this.currentTrace);
    }

    stopDrawing() {
        this.isDrawing = false;
        this.currentTrace = null;
    }

    addTracePoint() {
        const last = this.currentTrace.last;
        if (last.distanceTo(this.tip) < 0.12) return;
        const mesh = new THREE.Mesh(
            ribbonGeometry([[last.clone(), this.tip.clone()]], 0.07).geometry,
            new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.85, depthWrite: false })
        );
        mesh.position.y = 0.014;
        this.scene.add(mesh);
        this.currentTrace.segments.push({ mesh, born: performance.now() });
        this.currentTrace.last = this.tip.clone();
    }

    fadeTraces() {
        const now = performance.now();
        const life = 6000;
        this.traces = this.traces.filter(trace => {
            trace.segments = trace.segments.filter(seg => {
                const age = now - seg.born;
                if (age > life) {
                    this.scene.remove(seg.mesh);
                    seg.mesh.geometry.dispose();
                    seg.mesh.material.dispose();
                    return false;
                }
                if (age > life / 2) seg.mesh.material.opacity = 0.85 * (1 - (age - life / 2) / (life / 2));
                return true;
            });
            return trace.segments.length > 0 || trace === this.currentTrace;
        });
    }

    // --- autopilot writing ----------------------------------------------------

    // strokes: arrays of world-space Vector3 on the desk. Resolves when done.
    write(strokes, { speed = 15, travel = 34, width = 0.06 } = {}) {
        const ink = ribbonGeometry(strokes, width);
        const mesh = new THREE.Mesh(ink.geometry, new THREE.MeshBasicMaterial({
            color: INK, transparent: true, opacity: 0.9, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -1,
        }));
        mesh.position.y = 0.012;
        mesh.geometry.setDrawRange(0, 0);
        this.scene.add(mesh);

        // Timeline: pen-up hops between strokes, pen-down along them
        const moves = [];
        let at = this.tip.clone();
        let segIndex = 0;
        strokes.forEach(stroke => {
            moves.push({ from: at, to: stroke[0], len: at.distanceTo(stroke[0]), down: false });
            for (let i = 1; i < stroke.length; i++) {
                moves.push({ from: stroke[i - 1], to: stroke[i], len: stroke[i - 1].distanceTo(stroke[i]), down: true, seg: segIndex++ });
            }
            at = stroke[stroke.length - 1];
        });

        this.stopDrawing();
        return new Promise(resolve => {
            this.job = { moves, index: 0, t: 0, speed, travel, mesh, resolve };
        });
    }

    stepJob(dt) {
        const job = this.job;
        let budget = dt;
        while (budget > 0 && job.index < job.moves.length) {
            const m = job.moves[job.index];
            const rate = m.down ? job.speed : job.travel;
            const need = (m.len * (1 - job.t)) / rate;
            if (budget >= need) {
                budget -= need;
                job.index++;
                job.t = 0;
                if (m.down) job.mesh.geometry.setDrawRange(0, (m.seg + 1) * 6);
            } else {
                job.t += (budget * rate) / (m.len || 1);
                budget = 0;
            }
        }

        const m = job.moves[Math.min(job.index, job.moves.length - 1)];
        const t = job.index >= job.moves.length ? 1 : job.t;
        this.target.lerpVectors(m.from, m.to, t);
        this.pressing = m.down && job.index < job.moves.length;

        if (job.index >= job.moves.length) {
            this.job = null;
            this.pressing = false;
            job.resolve();
        }
    }

    // --- per frame ------------------------------------------------------------

    update(dt = 1 / 60) {
        if (this.job) this.stepJob(dt);
        else this.aimAtMouse();

        // Follow: snappy when writing, a touch of lag when chasing the cursor
        const prev = this.tip.clone();
        const follow = this.job ? 1 : 1 - Math.exp(-dt * 22);
        this.tip.lerp(this.target, follow);
        this.velocity.subVectors(this.tip, prev).divideScalar(Math.max(dt, 1e-3));

        const down = this.job ? this.pressing : this.isDrawing;
        this.lift += ((down ? 0 : 1) - this.lift) * (1 - Math.exp(-dt * 18));

        this.holder.position.set(this.tip.x, this.lift * HOVER_HEIGHT, this.tip.z);

        // Lean, plus a little drag opposite to the direction of travel
        const drag = this.velocity.clone().multiplyScalar(-0.005).clampLength(0, 0.15);
        const LEAN = 0.32;
        const axis = UP.clone().multiplyScalar(Math.cos(LEAN))
            .addScaledVector(this.leanDir, Math.sin(LEAN))
            .add(drag)
            .normalize();
        this.holder.quaternion.setFromUnitVectors(UP, axis);

        if (this.isDrawing && !this.job) this.addTracePoint();
        this.fadeTraces();
    }
}

// Flat ribbons on the desk. Six vertices per segment, in drawing order,
// so setDrawRange(0, n * 6) reveals the first n segments.
function ribbonGeometry(strokes, halfWidth) {
    const pos = [];
    const dir = new THREE.Vector3();
    const n = new THREE.Vector3();
    strokes.forEach(stroke => {
        for (let i = 1; i < stroke.length; i++) {
            const a = stroke[i - 1], b = stroke[i];
            dir.subVectors(b, a).setY(0);
            if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
            dir.normalize();
            n.set(-dir.z, 0, dir.x).multiplyScalar(halfWidth);
            // Overlap the ends a bit so corners don't show gaps
            const a0 = a.clone().addScaledVector(dir, -halfWidth * 0.8);
            const b0 = b.clone().addScaledVector(dir, halfWidth * 0.8);
            const p = [a0.clone().add(n), a0.clone().sub(n), b0.clone().add(n), b0.clone().sub(n)];
            // Wound so the faces point up (back faces get culled)
            [p[0], p[2], p[1], p[2], p[3], p[1]].forEach(v => pos.push(v.x, 0, v.z));
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return { geometry };
}

export function setupPencilCursor(scene, camera, renderer) {
    return new PencilCursor(scene, camera, renderer);
}
