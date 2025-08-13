import * as THREE from 'three';

// === 3D PENCIL CURSOR WITH DYNAMIC TRACES ===
export class PencilCursor {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        // Pencil properties
        this.pencil = null;
        this.pencilTip = null;
        this.isDrawing = false;
        
        // Mouse tracking
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.intersectionPoint = new THREE.Vector3();
        
        // Drawing traces
        this.traces = [];
        this.currentTrace = null;
        this.traceGeometry = null;
        this.traceMaterial = null;
        
        
        // Animation properties
        this.clock = new THREE.Clock();
        
        this.init();
        this.setupEventListeners();
    }

    init() {
        this.createPencil();
        this.createTraceMaterial();
    }

    createPencil() {
        const fixedHeight = 20;
        const pencilGroup = new THREE.Group();
        
        // Pencil body (wooden part) - 10x bigger
        const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xDEB887,
            map: this.createWoodTexture()
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 4;
        pencilGroup.add(body);

        // Metal ferrule (the band) - 10x bigger
        const ferruleGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.8, 8);
        const ferruleMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xC0C0C0,
            metalness: 0.8,
            roughness: 0.2
        });
        const ferrule = new THREE.Mesh(ferruleGeometry, ferruleMaterial);
        ferrule.position.y = 0;
        pencilGroup.add(ferrule);

        // Eraser - 10x bigger
        const eraserGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8);
        const eraserMaterial = new THREE.MeshLambertMaterial({ color: 0xFF69B4 });
        const eraser = new THREE.Mesh(eraserGeometry, eraserMaterial);
        eraser.position.y = -0.4;
        pencilGroup.add(eraser);

        // Pencil tip (graphite) - 10x bigger
        const tipGeometry = new THREE.ConeGeometry(0.2, 1, 8);
        const tipMaterial = new THREE.MeshLambertMaterial({ color: 0x2F2F2F });
        this.pencilTip = new THREE.Mesh(tipGeometry, tipMaterial);
        this.pencilTip.position.y = 8.6;
        pencilGroup.add(this.pencilTip);

        // Position pencil above the scene initially
        pencilGroup.position.set(0, 9, 0);
        pencilGroup.set
        pencilGroup.rotation.z = Math.PI; // Point tip down
        
        this.pencil = pencilGroup;
        this.scene.add(this.pencil);
    }

    createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Wood grain pattern
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#DEB887');
        gradient.addColorStop(0.5, '#D2B48C');
        gradient.addColorStop(1, '#CD853F');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 256);
        
        // Add wood grain lines
        ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';
        ctx.lineWidth = 0.2;
        for (let i = 0; i < 10; i++) {
            const y = (i / 10) * 256;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(64, y + Math.sin(i) * 10);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createTraceMaterial() {
        this.traceMaterial = new THREE.MeshBasicMaterial({
            color: 0x2F2F2F,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousemove', (event) => {
            this.updateMousePosition(event);
            this.updatePencilPosition();
        });

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 2) { // Left click
                this.startDrawing();
            }
        });

        canvas.addEventListener('mouseup', () => {
            this.stopDrawing();
        });

        canvas.addEventListener('mouseleave', () => {
            this.stopDrawing();
        });
    }

    updateMousePosition(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    updatePencilPosition() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Define a plane at a constant height
        const fixedHeight = 0; // The height where you want the pencil tip to be
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixedHeight);
        
        const intersectionPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersectionPoint);
        
        if (intersectionPoint) {
            
            // Adjust the pencil's position so the tip is at the fixed height.
            this.pencil.position.set(
                intersectionPoint.x,
                fixedHeight + 8.8,
                intersectionPoint.z
            );
            
            // // Tilt pencil based on mouse movement
            // const tiltX = this.mouse.y * 0.2;
            // const tiltZ = -this.mouse.x * 0.2;
            // this.pencil.rotation.set(tiltX, 0, Math.PI + tiltZ);
    
            // Store the *tip's* position for drawing traces
            this.intersectionPoint.copy(intersectionPoint);
        }
    }

    startDrawing() {
        if (!this.isDrawing && this.intersectionPoint) {
            this.isDrawing = true;
            this.createNewTrace();
            
            // Add slight animation to pencil tip
            this.animatePencilTip();
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.currentTrace = null;
        }
    }

    createNewTrace() {
        const tracePoints = [];
        tracePoints.push(this.intersectionPoint.clone());
        
        this.currentTrace = {
            points: tracePoints,
            mesh: null,
            age: 0,
            maxAge: 5000, // 5 seconds lifetime
            width: 0.5 // 10x bigger trace width
        };
        
        this.traces.push(this.currentTrace);
    }

    addTracePoint() {
        if (this.currentTrace && this.intersectionPoint) {
            const lastPoint = this.currentTrace.points[this.currentTrace.points.length - 1];
            const distance = lastPoint.distanceTo(this.intersectionPoint);
            
            // Only add point if it's far enough from the last one (adjusted for bigger pencil)
            if (distance > 1) {
                this.currentTrace.points.push(this.intersectionPoint.clone());
                this.updateTraceMesh();
            }
        }
    }

    updateTraceMesh() {
        if (!this.currentTrace || this.currentTrace.points.length < 2) return;
        
        const points = this.currentTrace.points;
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Create a tube-like geometry from points
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const width = this.currentTrace.width;
            
            // Create cross-section vertices
            vertices.push(
                point.x - width/2, point.y + 0.01, point.z - width/2,
                point.x + width/2, point.y + 0.01, point.z - width/2,
                point.x + width/2, point.y + 0.01, point.z + width/2,
                point.x - width/2, point.y + 0.01, point.z + width/2
            );
            
            // Create indices for quads
            if (i > 0) {
                const base = (i - 1) * 4;
                const next = i * 4;
                
                // Connect to previous segment
                indices.push(
                    base, base + 1, next,
                    base + 1, next + 1, next,
                    base + 1, base + 2, next + 1,
                    base + 2, next + 2, next + 1,
                    base + 2, base + 3, next + 2,
                    base + 3, next + 3, next + 2,
                    base + 3, base, next + 3,
                    base, next, next + 3
                );
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Remove old mesh
        if (this.currentTrace.mesh) {
            this.scene.remove(this.currentTrace.mesh);
            this.currentTrace.mesh.geometry.dispose();
        }
        
        // Create new mesh
        this.currentTrace.mesh = new THREE.Mesh(geometry, this.traceMaterial.clone());
        this.scene.add(this.currentTrace.mesh);
    }

    animatePencilTip() {
        if (this.pencilTip) {
            // Small bounce animation
            const originalScale = this.pencilTip.scale.clone();
            this.pencilTip.scale.multiplyScalar(0.9);
            
            setTimeout(() => {
                if (this.pencilTip) {
                    this.pencilTip.scale.copy(originalScale);
                }
            }, 100);
        }
    }

    update() {
        const deltaTime = this.clock.getDelta() * 1000;
        
        // Add trace point if drawing
        if (this.isDrawing) {
            this.addTracePoint();
        }
        
        // Update existing traces
        this.traces = this.traces.filter(trace => {
            trace.age += deltaTime;
            
            if (trace.mesh) {
                // Fade out over time
                const fadeStart = trace.maxAge * 0.7;
                if (trace.age > fadeStart) {
                    const fadeProgress = (trace.age - fadeStart) / (trace.maxAge - fadeStart);
                    trace.mesh.material.opacity = 0.8 * (1 - fadeProgress);
                }
                
                // Remove if too old
                if (trace.age > trace.maxAge) {
                    this.scene.remove(trace.mesh);
                    trace.mesh.geometry.dispose();
                    trace.mesh.material.dispose();
                    return false;
                }
            }
            
            return true;
        });
    }

    dispose() {
        // Clean up resources
        if (this.pencil) {
            this.scene.remove(this.pencil);
        }
        
        this.traces.forEach(trace => {
            if (trace.mesh) {
                this.scene.remove(trace.mesh);
                trace.mesh.geometry.dispose();
                trace.mesh.material.dispose();
            }
        });
        
        this.traces = [];
    }
}

// Export setup function for easy integration
export function setupPencilCursor(scene, camera, renderer) {
    return new PencilCursor(scene, camera, renderer);
}