import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { setupLighting } from './lighting.js';
import { setupFloor } from './floor.js';
import { setupParticles, animateParticles } from './particles.js';
import { createPortfolioItems } from './portfolioItems.js';
import { setupControls } from './controls.js';
import { setupInteraction } from './interaction.js';
import { sceneReady } from './ui.js';
import { setupPencilCursor } from './pencil.js';
import { createSpotifyLogo } from './spotifyLogo.js';
import { setupWanderingDog } from './dog.js';
import { writeText } from './handwriting.js';

// === MAIN APPLICATION ===
class PortfolioApp {
    constructor() {
        this.portfolioItems = [];
        this.particleSystem = null;
        this.controls = null;
        this.frameCount = 0;
        this.spotifyLogo = null;
        this.pencilCursor = null;
        this.wanderingDog = null;
        this.running = false;
        this.clock = new THREE.Clock();

        this.init();
    }

    async init() {
        try {
            console.log('Initializing Portfolio App...');
            
            // Setup all components in order
            console.log('Setting up lighting...');
            setupLighting();
            
            console.log('Setting up floor...');
            setupFloor();
            
            console.log('Setting up particles...');
            this.particleSystem = setupParticles();
            
            console.log('Creating portfolio items...');
            this.portfolioItems = createPortfolioItems();
            
            console.log('Creating Spotify logo...');
            this.spotifyLogo = createSpotifyLogo();
            
            console.log('Creating wandering dog...');
            this.wanderingDog = setupWanderingDog(scene, camera);
            
            console.log('Setting up controls...');
            this.controls = setupControls();
            
            console.log('Setting up interaction...');
            setupInteraction(this.portfolioItems, this.spotifyLogo, this.wanderingDog);
            
            console.log('Setting up pencil cursor...');
            this.pencilCursor = setupPencilCursor(scene, camera, renderer);

            console.log('Starting animation loop...');
            // Pause rendering while the 2D page is showing, pick back up on return
            document.addEventListener('modechange', () => this.start());
            this.start();
            
        } catch (error) {
            console.error('Error initializing Portfolio App:', error);
        }
    }

    start() {
        if (this.running || document.documentElement.dataset.mode !== '3d') return;
        this.running = true;
        this.animate();
    }

    animate() {
        if (document.documentElement.dataset.mode !== '3d') {
            this.running = false;
            return;
        }
        requestAnimationFrame(() => this.animate());
        this.frameCount++;
        const dt = Math.min(this.clock.getDelta(), 0.05);
        const time = this.clock.elapsedTime;

        try {
            // Hide loading screen after a few frames
            if (this.frameCount === 10) {
                sceneReady();
            }

            // Animate particles
            if (this.particleSystem) {
                animateParticles(this.particleSystem);
            }
            
            // Update pencil cursor
            if (this.pencilCursor) {
                this.pencilCursor.update(dt);
                // Once the notes have landed, the pencil says hi
                if (!this.saidHello && this.portfolioItems.every(c => c.landed)) {
                    this.saidHello = true;
                    this.writeHello();
                }
            }

            // Update wandering dog
            if (this.wanderingDog) {
                this.wanderingDog.update();
            }

            // Notes: toss-in, hover peek, open/close
            this.portfolioItems.forEach(card => card.update(dt, time));

            // Animate floating decorative elements
            this.animateFloatingElements();

            // Update controls
            if (this.controls) {
                this.controls.update();
            }
            
            // Render the scene
            renderer.render(scene, camera);
            
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }

    // Handwrite a greeting on the desk, lined up with the screen
    async writeHello() {
        const pencil = this.pencilCursor;
        const place = (strokes, origin, size) => strokes.map(stroke => stroke.map(([x, y]) =>
            origin.clone()
                .addScaledVector(pencil.right, x * size)
                .addScaledVector(pencil.forward, -y * size)
        ));

        const em = 2.1;
        const start = pencil.groundAt(-0.8, -0.36);
        const below = start.clone()
            .addScaledVector(pencil.forward, -em * 1.2)
            .addScaledVector(pencil.right, em * 0.25);

        await pencil.write(place(writeText("Hi, I'm Derek"), start, em));
        await pencil.write(place(writeText('(Pick a note)'), below, em * 0.6), { width: 0.045 });
    }

    // Animate floating decorative elements
    animateFloatingElements() {
        // Find all floating elements in the scene
        const animateElement = (element) => {
            if (element.userData && element.userData.floatSpeed) {
                // Floating animation
                const time = Date.now() * element.userData.floatSpeed;
                element.position.y = element.userData.originalY + Math.sin(time) * 0.3;
                
                // Rotation animation
                if (element.userData.rotationSpeed) {
                    element.rotation.y += element.userData.rotationSpeed;
                    element.rotation.z += element.userData.rotationSpeed * 0.5;
                }
            }
            
            // Handle geometric shape rotations
            if (element.userData && element.userData.axis) {
                element.rotateOnAxis(element.userData.axis, element.userData.rotationSpeed);
            }
            
            // Handle pulsing sound rings
            if (element.userData && element.userData.pulseSpeed) {
                const time = Date.now() * element.userData.pulseSpeed;
                const scale = element.userData.baseScale + Math.sin(time) * element.userData.pulseAmplitude;
                element.scale.setScalar(scale);
            }
            
            // Recursively animate children
            element.children.forEach(animateElement);
        };

        scene.children.forEach(animateElement);
    }
}

// ui.js imports this module only once 3D mode is chosen, so start right away
new PortfolioApp();
