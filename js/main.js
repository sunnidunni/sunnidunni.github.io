import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { setupLighting } from './lighting.js';
import { setupFloor } from './floor.js';
import { setupParticles, animateParticles } from './particles.js';
import { createPortfolioItems } from './portfolioItems.js';
import { setupControls } from './controls.js';
import { setupInteraction, setupModals } from './interaction.js';
import { hideLoadingScreen } from './loading.js';
import { setupPencilCursor } from './pencil.js';
import { createSpotifyLogo } from './spotifyLogo.js';

// === MAIN APPLICATION ===
class PortfolioApp {
    constructor() {
        this.portfolioItems = [];
        this.particleSystem = null;
        this.controls = null;
        this.frameCount = 0;
        this.spotifyLogo = null;

        this.pencilCursor = null;
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
            
            console.log('Setting up controls...');
            this.controls = setupControls();
            
            console.log('Setting up interaction...');
            setupInteraction(this.portfolioItems, this.spotifyLogo);
            
            console.log('Setting up modals...');
            setupModals();

            console.log('Setting up pencil cursor...');
            this.pencilCursor = setupPencilCursor(scene, camera, renderer);

            console.log('Starting animation loop...');
            // Start animation loop
            this.animate();
            
        } catch (error) {
            console.error('Error initializing Portfolio App:', error);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.frameCount++;

        try {
            // Hide loading screen after a few frames
            if (this.frameCount === 10) {
                hideLoadingScreen();
            }

            // Animate particles
            if (this.particleSystem) {
                animateParticles(this.particleSystem);
            }
            if (this.pencilCursor) {
                this.pencilCursor.update();
            }

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

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating Portfolio App...');
    try {
        new PortfolioApp();
    } catch (error) {
        console.error('Error creating Portfolio App:', error);
    }
});

// Also try to initialize if DOM is already loaded
if (document.readyState === 'loading') {
    console.log('DOM still loading...');
} else {
    console.log('DOM already loaded, creating Portfolio App immediately...');
    try {
        new PortfolioApp();
    } catch (error) {
        console.error('Error creating Portfolio App:', error);
    }
}