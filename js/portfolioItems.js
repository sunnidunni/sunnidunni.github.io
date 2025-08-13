import * as THREE from 'three';
import { scene } from './scene.js';
import { createTextTexture } from './textures.js';

// === PORTFOLIO ITEMS ===
export function createPortfolioItems() {
    const portfolioItems = [];
    const itemGeometry = new THREE.BoxGeometry(4, 0.8, 6); // Thicker items

    // About Me Item
    const aboutTexture = createTextTexture('About Me', 512, 768);
    const aboutMaterial = new THREE.MeshStandardMaterial({ 
        map: aboutTexture, 
        roughness: 0.05, 
        metalness: 0.9,
        transparent: true,
        opacity: 0.98,
        envMapIntensity: 1.2
    });
    const aboutItem = new THREE.Mesh(itemGeometry, aboutMaterial);
    aboutItem.position.set(0, 0.4, 6);
    aboutItem.rotation.x = 0;
    aboutItem.rotation.y = 1;
    aboutItem.rotation.z = 0;
    aboutItem.castShadow = true;
    aboutItem.userData = { id: 'about', originalY: 0.4 };
    scene.add(aboutItem);
    portfolioItems.push(aboutItem);

    // Projects Item
    const projectsTexture = createTextTexture('Projects', 512, 768);
    const projectsMaterial = new THREE.MeshStandardMaterial({ 
        map: projectsTexture, 
        roughness: 0.05, 
        metalness: 0.9,
        transparent: true,
        opacity: 0.98,
        envMapIntensity: 1.2
    });
    const projectsItem = new THREE.Mesh(itemGeometry, projectsMaterial);
    projectsItem.position.set(6/Math.sqrt(2), 0.4, -6/Math.sqrt(2));
    projectsItem.rotation.x = 0;
    projectsItem.rotation.y = 1.5;
    projectsItem.rotation.z = 0;
    projectsItem.castShadow = true;
    projectsItem.userData = { id: 'projects', originalY: 0.4 };
    scene.add(projectsItem);
    portfolioItems.push(projectsItem);

    // Contact Item
    const contactTexture = createTextTexture('Contact', 512, 768);
    const contactMaterial = new THREE.MeshStandardMaterial({ 
        map: contactTexture, 
        roughness: 0.05, 
        metalness: 0.9,
        transparent: true,
        opacity: 0.98,
        envMapIntensity: 1.2
    });
    const contactItem = new THREE.Mesh(itemGeometry, contactMaterial);
    contactItem.position.set(-6/Math.sqrt(2), 0.4, -6/Math.sqrt(2));
    contactItem.rotation.x = 0;
    contactItem.rotation.y = 0.5;
    contactItem.rotation.z = 0;
    contactItem.castShadow = true;
    contactItem.userData = { id: 'contact', originalY: 0.4 };
    scene.add(contactItem);
    portfolioItems.push(contactItem);

   

    return portfolioItems;
} 