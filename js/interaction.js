import * as THREE from 'three';
import { camera } from './scene.js';

// === INTERACTION SETUP ===
export function setupInteraction(portfolioItems) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredItem = null;

    function onMouseMove(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(portfolioItems);

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
        } else {
            if (hoveredItem) {
                hoveredItem.position.y = hoveredItem.userData.originalY;
                hoveredItem.material.opacity = 0.98;
                hoveredItem.scale.set(1, 1, 1);
                hoveredItem = null;
            }
        }
    }

    function onMouseClick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(portfolioItems);

        if (intersects.length > 0) {
            const objectId = intersects[0].object.userData.id;
            openModal(objectId + 'Modal');
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

    window.addEventListener('click', (event) => {
        modals.forEach(modal => {
            if (event.target == modal) {
                closeModal();
            }
        });
    });
} 