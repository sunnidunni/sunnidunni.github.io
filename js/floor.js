import * as THREE from 'three';
import { scene } from './scene.js';

// === NOTEBOOK PAPER FLOOR SETUP ===
export function setupFloor() {
    // Create notebook paper floor texture
    const floorTexture = createNotebookPaperTexture();
    
    // Infinite notebook paper floor
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        roughness: 0.9,
        metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Lay it flat
    floor.position.y = 0; // Position at ground level
    floor.receiveShadow = true;
    scene.add(floor);
}

// Create notebook paper texture using the Canvas API
function createNotebookPaperTexture() {
    const canvas = document.createElement('canvas');
    const canvasSize = 512;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext('2d');
    
    // --- Define the theme colors ---
    const colors = {
        background: '#f7f5ee',
        // UPDATED: A more visible, higher-contrast blue for the lines
        horizontalLine: '#8ab4f8', 
        verticalLine: '#e08080',
        hole: '#444444',
        pen: '#222831'
    };

    // --- 1. Draw the paper background ---
    context.fillStyle = colors.background;
    context.fillRect(0, 0, canvasSize, canvasSize);

    // --- 2. Draw the HORIZONTAL writing lines ---
    context.beginPath();
    context.strokeStyle = colors.horizontalLine;
    // UPDATED: Made lines slightly thicker to ensure visibility
    context.lineWidth = 2.5; 
    const lineSpacing = 24;
    for (let y = lineSpacing; y < canvasSize; y += lineSpacing) {
        context.moveTo(0, y);
        context.lineTo(canvasSize, y);
        context.stroke();
    }

    // --- 3. Draw the VERTICAL margin line ---
    context.beginPath();
    context.strokeStyle = colors.verticalLine;
    context.lineWidth = 2; // Keep this one a bit thicker
    const marginX = 60;
    context.moveTo(marginX, 0);
    context.lineTo(marginX, canvasSize);
    context.stroke();
    
    // --- 4. Draw the punch holes ---
    const holeRadius = 6;
    const holeX = marginX / 2.5;
    context.fillStyle = colors.hole;
    const drawHole = (y) => {
        context.beginPath();
        context.arc(holeX, y, holeRadius, 0, Math.PI * 2, true);
        context.fill();
    };
    drawHole(canvasSize * 0.2);
    drawHole(canvasSize * 0.5);
    drawHole(canvasSize * 0.8);

    // --- 5. Add the scribbles on top ---
    addScribblesAndDoodles(context, colors.pen);

    // --- Create the Three.js texture from the canvas ---
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(15, 15);
    
    return texture;
}

/**
 * Adds hand-drawn doodles to the canvas context.
 * @param {CanvasRenderingContext2D} context The canvas context to draw on.
 * @param {string} color The color of the pen ink.
 */
function addScribblesAndDoodles(context, color) {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.5;

    // Doodle 1: Spiral
    context.beginPath();
    let radius = 5;
    let angle = 0;
    context.moveTo(150, 100);
    for (let i = 0; i < 150; i++) {
        radius += 0.75;
        angle += (Math.PI * 2) / 20;
        const x = 150 + radius * Math.cos(angle);
        const y = 100 + radius * Math.sin(angle);
        context.lineTo(x, y);
    }
    context.stroke();

    // Doodle 2: Tic-tac-toe
    context.beginPath();
    context.moveTo(350, 180); context.lineTo(350, 260);
    context.moveTo(380, 180); context.lineTo(380, 260);
    context.moveTo(320, 205); context.lineTo(410, 205);
    context.moveTo(320, 235); context.lineTo(410, 235);
    context.stroke();
    context.font = '24px "Comic Sans MS", cursive, sans-serif';
    context.fillText('X', 325, 200);
    context.fillText('O', 355, 200);
    context.fillText('X', 355, 230);
    context.fillText('O', 325, 258);
    context.fillText('X', 385, 258);

    // Doodle 3: Scribbled-out word
    context.font = '28px "Comic Sans MS", cursive, sans-serif';
    context.fillText('Derek', 120, 400);
    context.beginPath();
    context.moveTo(110, 395);
    context.quadraticCurveTo(150, 375, 190, 395);
    context.quadraticCurveTo(230, 415, 270, 395);
    context.stroke();
}