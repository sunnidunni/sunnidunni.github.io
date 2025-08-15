import * as THREE from 'three';
import { camera } from './scene.js';

// === INTERACTION SETUP ===
let isModalOpen = false;

export function setupInteraction(portfolioItems, spotifyLogo = null, dog = null) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredItem = null;
    let hoveredSpotify = false;
    let hoveredDog = false;
    let lastMove = 0;
    
    function onMouseMove(event) {
        const now = performance.now();
        if (now - lastMove < 16) return; // ~60fps
        lastMove = now;
        
        // Don't process interactions if modal is open
        if (isModalOpen) return;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        
        // Check portfolio items
        const intersects = raycaster.intersectObjects(portfolioItems);
        
        // Check Spotify logo
        let spotifyIntersects = [];
        if (spotifyLogo) {
            spotifyIntersects = raycaster.intersectObjects(spotifyLogo.getIntersectable());
        }

        // Check dog
        let dogIntersects = [];
        if (dog) {
            dogIntersects = raycaster.intersectObjects(dog.getIntersectable(), true);
        }

        if (intersects.length > 0) {
            if (hoveredItem !== intersects[0].object) {
                if (hoveredItem) {
                    // Reset previous hovered item
                    hoveredItem.position.y = hoveredItem.userData.originalY;
                    hoveredItem.material.opacity = 0.98;
                    hoveredItem.scale.set(1, 1, 1);
                }
                hoveredItem = intersects[0].object;
                // Hover effect - subtle lift and scale increase
                hoveredItem.position.y = hoveredItem.userData.originalY + 0.2;
                hoveredItem.material.opacity = 1;
                hoveredItem.scale.set(1.05, 1.05, 1.05);
            }
            // Reset other hovers
            if (hoveredSpotify && spotifyLogo) {
                spotifyLogo.onHover(false);
                hoveredSpotify = false;
            }
            if (hoveredDog) {
                hoveredDog = false;
                document.body.style.cursor = 'default';
            }
        } else if (spotifyIntersects.length > 0) {
            // Hovering Spotify logo
            if (!hoveredSpotify && spotifyLogo) {
                spotifyLogo.onHover(true);
                hoveredSpotify = true;
            }
            // Reset other hovers
            if (hoveredItem) {
                hoveredItem.position.y = hoveredItem.userData.originalY;
                hoveredItem.material.opacity = 0.98;
                hoveredItem.scale.set(1, 1, 1);
                hoveredItem = null;
            }
            if (hoveredDog) {
                hoveredDog = false;
                document.body.style.cursor = 'default';
            }
        } else if (dogIntersects.length > 0) {
            // Hovering dog
            if (!hoveredDog) {
                hoveredDog = true;
                document.body.style.cursor = 'pointer';
            }
            // Reset other hovers
            if (hoveredItem) {
                hoveredItem.position.y = hoveredItem.userData.originalY;
                hoveredItem.material.opacity = 0.98;
                hoveredItem.scale.set(1, 1, 1);
                hoveredItem = null;
            }
            if (hoveredSpotify && spotifyLogo) {
                spotifyLogo.onHover(false);
                hoveredSpotify = false;
            }
        } else {
            // Not hovering anything
            if (hoveredItem) {
                hoveredItem.position.y = hoveredItem.userData.originalY;
                hoveredItem.material.opacity = 0.98;
                hoveredItem.scale.set(1, 1, 1);
                hoveredItem = null;
            }
            if (hoveredSpotify && spotifyLogo) {
                spotifyLogo.onHover(false);
                hoveredSpotify = false;
            }
            if (hoveredDog) {
                hoveredDog = false;
                document.body.style.cursor = 'default';
            }
        }
    }

    function onMouseClick(event) {
        // Don't process clicks if modal is open
        if (isModalOpen) return;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Check portfolio items
        const intersects = raycaster.intersectObjects(portfolioItems);
        
        // Check Spotify logo
        let spotifyIntersects = [];
        if (spotifyLogo) {
            spotifyIntersects = raycaster.intersectObjects(spotifyLogo.getIntersectable());
        }

        // Check dog
        let dogIntersects = [];
        if (dog) {
            dogIntersects = raycaster.intersectObjects(dog.getIntersectable(), true);
        }

        if (intersects.length > 0) {
            const objectId = intersects[0].object.userData.id;
            openModal(objectId + 'Modal');
        } else if (spotifyIntersects.length > 0) {
            if (spotifyLogo) {
                spotifyLogo.onClick();
                openModal('musicModal');
            }
        } else if (dogIntersects.length > 0) {
            if (dog) {
                dog.onClick();
                openModal('catModal');
                // Note: The dog's onClick method will handle opening the cat modal
            }
        }
    }

    // Add event listeners
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('click', onMouseClick, false);

    return { raycaster, mouse, hoveredItem };
}

// === MODAL FUNCTIONS ===
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        isModalOpen = true;
        modal.style.display = 'block';
        // Trigger animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }
}

export function setupModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-button');

    function closeModal() {
        isModalOpen = false;
        modals.forEach(modal => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        });
    }

    closeButtons.forEach(button => {
        button.addEventListener('click', closeModal);
    });

    // Also handle dynamically created modals
    document.addEventListener('click', (event) => {
        if (event.target.classList.contains('close-button')) {
            closeModal();
        }
    });

    window.addEventListener('click', (event) => {
        modals.forEach(modal => {
            if (event.target == modal) {
                closeModal();
            }
        });
        
        // Handle dynamically created modals
        if (event.target.classList.contains('modal')) {
            closeModal();
        }
    });
}