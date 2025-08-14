import * as THREE from 'three';
import { scene } from './scene.js';

// === PENCIL-DRAWN SPOTIFY LOGO ON FLOOR ===
export class SpotifyLogo {
    constructor() {
        this.logoGroup = new THREE.Group();
        this.hoverTween = null;
        this.originalScale = 1;
        this.isHovered = false;
        
        this.createPencilDrawnSpotifyLogo();
        this.logoGroup.userData = { id: 'music', type: 'spotifyLogo' };
        
        scene.add(this.logoGroup);
    }

    createPencilDrawnSpotifyLogo() {
        const logoRadius = 2.9;
        const center = { x: 15, z: 10 };
        
        // Create invisible collision mesh for better interaction
        this.createCollisionMesh(center, logoRadius);
        
        // Create pencil-drawn circle outline (multiple sketchy lines)
        this.createSketchyCircle(center, logoRadius);
        
        // Create hand-drawn Spotify sound waves
        this.createSketchySoundWaves(center, logoRadius);
        
        // Add pencil texture and shading
        this.addPencilShading(center, logoRadius);
    }

    createCollisionMesh(center, radius) {
        // Create a larger invisible plane for easier interaction
        const collisionGeometry = new THREE.CircleGeometry(radius * 1.2, 32);
        const collisionMaterial = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            opacity: 0,
            side: THREE.DoubleSide
        });
        
        const collisionMesh = new THREE.Mesh(collisionGeometry, collisionMaterial);
        collisionMesh.rotation.x = -Math.PI / 2;
        collisionMesh.position.set(center.x, 0.01, center.z);
        
        // Mark this as the primary interaction mesh
        collisionMesh.userData = { isPrimaryInteraction: true };
        
        this.logoGroup.add(collisionMesh);
    }

    createSketchyCircle(center, radius) {
        const pencilColor = 0x2d3748; // Dark pencil gray
        const lineWidth = 0.08;
        
        // Create multiple slightly offset circles for sketchy effect
        for (let i = 0; i < 4; i++) {
            const points = [];
            const segments = 64;
            const roughness = 0.1 + i * 0.05; // Increasing roughness for each layer
            
            for (let j = 0; j <= segments; j++) {
                const angle = (j / segments) * Math.PI * 2;
                
                // Add hand-drawn imperfections
                const radiusVariation = radius + (Math.random() - 0.5) * roughness;
                const angleVariation = angle + (Math.random() - 0.5) * 0.1;
                
                const x = Math.cos(angleVariation) * radiusVariation;
                const z = Math.sin(angleVariation) * radiusVariation;
                
                points.push(new THREE.Vector3(x, 0, z));
            }
            
            // Close the loop
            points.push(points[0]);
            
            const curvePath = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(
                curvePath, 
                segments, 
                lineWidth * (1 + i * 0.3), // Varying thickness
                6, 
                true
            );
            
            const tubeMaterial = new THREE.MeshBasicMaterial({ 
                color: pencilColor,
                transparent: true,
                opacity: 0.7 - i * 0.1 // Lighter for overlapping effect
            });
            
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tube.position.set(center.x, 0.02 + i * 0.01, center.z);
            
            this.logoGroup.add(tube);
        }
    }

    createSketchySoundWaves(center, radius) {
        const pencilColor = 0x2d3748;
        const lineWidth = 0.12;
        
        // Hand-drawn wave configurations
        const waves = [

            {
                // Middle wave
                width: radius * 0.70,
                yPos: radius * 0.05,
                curve: 0.35,
                layers: 3
            },

            {
                // Bottom wave (shortest)
                width: radius * 0.55,
                yPos: radius * -0.25,
                curve: 0.3,
                layers: 2
            },
            {
                // Top wave (longest) - multiple sketchy lines
                width: radius * 0.85,
                yPos: radius * 0.35,
                curve: 0.4,
                layers: 3
            }
        ];

        waves.forEach((wave, waveIndex) => {
            // Create multiple layers for each wave to simulate pencil strokes
            for (let layer = wave.layers; layer > 0; layer--) {
                this.createSketchyWave(center, wave, pencilColor, lineWidth, layer);
            }
        });
    }

    createSketchyWave(center, waveConfig, color, baseWidth, layer) {
        const points = [];
        const segments = 32;
        const { width, yPos, curve } = waveConfig;
        const roughness = 0.08 + layer * 0.04;
        
        // Create hand-drawn imperfect curve
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            
            // Base curve with hand-drawn variations
            const baseX = (t - 0.5) * width;
            const baseZ = yPos + Math.sin(t * Math.PI) * curve - 0.4;
            
            // Add pencil stroke imperfections
            const x = baseX + (Math.random() - 0.5) * roughness;
            const z = baseZ + (Math.random() - 0.5) * roughness * 0.5;
            
            points.push(new THREE.Vector3(x, 0, -z));
        }
        
        // Create the sketchy wave line
        const curvePath = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(
            curvePath, 
            segments, 
            baseWidth * (1 + layer * 0.2), // Varying thickness for layered effect
            6, 
            false
        );
        
        const tubeMaterial = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.8 - layer * 0.15 // Lighter for overlapping strokes
        });
        
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.position.set(
            center.x + (Math.random() - 0.5) * 0.05, // Slight position variation
            0.05 + layer * 0.01, 
            center.z + (Math.random() - 0.5) * 0.05
        );
        
        this.logoGroup.add(tube);
    }

    addPencilShading(center, radius) {
        const shadingColor = 0x4a5568; // Light pencil gray
        const lineWidth = 0.03;
        
        // Add cross-hatching for shading effect
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI;
            const length = radius * 0.6;
            
            // Create hatching lines with imperfections
            const points = [];
            const segments = 10;
            
            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                const x = Math.cos(angle) * (t - 0.5) * length;
                const z = Math.sin(angle) * (t - 0.5) * length;
                
                // Add hand-drawn wobble
                const wobbleX = x + (Math.random() - 0.5) * 0.1;
                const wobbleZ = z + (Math.random() - 0.5) * 0.1;
                
                points.push(new THREE.Vector3(wobbleX, 0, wobbleZ));
            }
            
            const curvePath = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(
                curvePath, 
                segments, 
                lineWidth, 
                4, 
                false
            );
            
            const tubeMaterial = new THREE.MeshBasicMaterial({ 
                color: shadingColor,
                transparent: true,
                opacity: 0.3
            });
            
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tube.position.set(center.x, 0.01, center.z);
            
            this.logoGroup.add(tube);
        }

        // Add some random pencil marks for texture
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * radius * 0.8;
            const length = Math.random() * 0.5 + 0.2;
            
            const startX = Math.cos(angle) * distance;
            const startZ = Math.sin(angle) * distance;
            const endX = startX + (Math.random() - 0.5) * length;
            const endZ = startZ + (Math.random() - 0.5) * length;
            
            const points = [
                new THREE.Vector3(startX, 0, startZ),
                new THREE.Vector3(endX, 0, endZ)
            ];
            
            const curvePath = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(
                curvePath, 
                8, 
                lineWidth * 0.7, 
                4, 
                false
            );
            
            const tubeMaterial = new THREE.MeshBasicMaterial({ 
                color: shadingColor,
                transparent: true,
                opacity: 0.4
            });
            
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tube.position.set(center.x, 0.005, center.z);
            
            this.logoGroup.add(tube);
        }
    }

    onHover(isHovered) {
        if (isHovered && !this.isHovered) {
            this.isHovered = true;
            
            // Gentle scale animation
            this.animateScale(1.1, 300);
            
            // Darken pencil strokes on hover
            this.logoGroup.children.forEach((child,index) => {
                if (child.material) {
                    if (index != 0) {
                        const currentOpacity = child.material.opacity;
                        child.material.opacity = Math.min(currentOpacity + 0.2, 1.0);
                    }
                }
            });
            
        } else if (!isHovered && this.isHovered) {
            this.isHovered = false;
            
            // Scale back to normal
            this.animateScale(1.0, 300);
            
            // Restore original opacity
            this.logoGroup.children.forEach((child, index) => {
                if (child.material) {
                    if (index == 0) {
                        child.material.opacity = 0
                    }
                    // Restore based on layer type
                    else if (index < 4) { // Circle layers
                        child.material.opacity = 0.7 - (index * 0.1);
                    } else if (index < 15) { // Wave layers
                        child.material.opacity = 0.8 - ((index - 4) % 3) * 0.15;
                    } else { // Shading layers
                        child.material.opacity = index < 23 ? 0.3 : 0.4;
                    }
                }
            });
        }
    }

    animateScale(targetScale, duration) {
        const startScale = this.logoGroup.scale.x;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing with slight overshoot for organic feel
            const easeProgress = 1 - Math.pow(1 - progress, 2);
            const currentScale = startScale + (targetScale - startScale) * easeProgress;
            
            this.logoGroup.scale.setScalar(currentScale);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    onClick() {
        setTimeout(() => {
            this.animateScale(this.isHovered ? 1.1 : 1.0, 200);
        }, 150);
        
        
    }

    getIntersectable() {
        return this.logoGroup.children;
    }

    dispose() {
        this.logoGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(this.logoGroup);
    }
}

export function createSpotifyLogo() {
    return new SpotifyLogo();
}