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

// === MAIN APPLICATION ===
class PortfolioApp {
    constructor() {
        this.portfolioItems = [];
        this.particleSystem = null;
        this.controls = null;
        this.frameCount = 0;

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
            
            console.log('Setting up controls...');
            this.controls = setupControls();
            
            console.log('Setting up interaction...');
            setupInteraction(this.portfolioItems);
            
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
        scene.children.forEach(child => {
            if (child.userData && child.userData.floatSpeed) {
                // Floating animation
                const time = Date.now() * child.userData.floatSpeed;
                child.position.y = child.userData.originalY + Math.sin(time) * 0.3;
                
                // Rotation animation
                if (child.userData.rotationSpeed) {
                    child.rotation.y += child.userData.rotationSpeed;
                    child.rotation.z += child.userData.rotationSpeed * 0.5;
                }
            }
        });
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