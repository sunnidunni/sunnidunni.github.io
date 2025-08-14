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
            maxAge: 5000, // 8 seconds lifetime
            width: 1, // 10x bigger trace width
            segments: [] // Store individual segments for gradual fade
        };
        
        this.traces.push(this.currentTrace);
    }

    addTracePoint() {
        if (this.currentTrace && this.intersectionPoint) {
            const lastPoint = this.currentTrace.points[this.currentTrace.points.length - 1];
            const distance = lastPoint.distanceTo(this.intersectionPoint);
            
            // Much more sensitive threshold for smoother lines
            if (distance > 0.3) {
                this.currentTrace.points.push(this.intersectionPoint.clone());
                this.createTraceSegment(lastPoint, this.intersectionPoint.clone());
            }
        }
    }

    createTraceSegment(startPoint, endPoint) {
        if (!this.currentTrace) return;
        
        // Create a small tube segment between two points
        const points = [startPoint, endPoint];
        const curve = new THREE.CatmullRomCurve3(points);
        const segmentGeometry = new THREE.TubeGeometry(curve, 8, 0.15, 8, false);
        
        const segmentMaterial = new THREE.MeshBasicMaterial({
            color: 0x2F2F2F,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        const segmentMesh = new THREE.Mesh(segmentGeometry, segmentMaterial);
        segmentMesh.position.y = 0.05;
        
        const segment = {
            mesh: segmentMesh,
            age: 0,
            creationTime: Date.now()
        };
        
        this.currentTrace.segments.push(segment);
        this.scene.add(segmentMesh);
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
        const currentTime = Date.now();
        
        // Add trace point if drawing
        if (this.isDrawing) {
            this.addTracePoint();
        }
        
        // Update existing traces with gradual segment fading
        this.traces = this.traces.filter(trace => {
            trace.age += deltaTime;
            
            // Update segments with gradual fade from oldest to newest
            if (trace.segments) {
                trace.segments = trace.segments.filter(segment => {
                    const segmentAge = currentTime - segment.creationTime;
                    const maxSegmentAge = 6000; // 6 seconds per segment
                    
                    if (segmentAge > maxSegmentAge) {
                        // Remove old segments
                        this.scene.remove(segment.mesh);
                        segment.mesh.geometry.dispose();
                        segment.mesh.material.dispose();
                        return false;
                    } else if (segmentAge > maxSegmentAge * 0.5) {
                        // Start fading after 3 seconds
                        const fadeStart = maxSegmentAge * 0.5;
                        const fadeProgress = (segmentAge - fadeStart) / (maxSegmentAge - fadeStart);
                        segment.mesh.material.opacity = 0.8 * (1 - fadeProgress);
                    }
                    
                    return true;
                });
            }
            
            // Remove trace if it has no more segments
            if (trace.segments && trace.segments.length === 0 && trace.age > 1000) {
                return false;
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
            
            if (trace.segments) {
                trace.segments.forEach(segment => {
                    this.scene.remove(segment.mesh);
                    segment.mesh.geometry.dispose();
                    segment.mesh.material.dispose();
                });
            }
        });
        
        this.traces = [];
    }
}

// Export setup function for easy integration
export function setupPencilCursor(scene, camera, renderer) {
    return new PencilCursor(scene, camera, renderer);
}