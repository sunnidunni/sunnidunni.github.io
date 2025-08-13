import * as THREE from 'three';
import { scene } from './scene.js';

// === RETRO PIXELATED FLOOR SETUP ===
export function setupFloor() {
    // Create retro pixelated floor texture
    const floorTexture = createRetroFloorTexture();
    
    // Infinite retro floor
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        roughness: 0.8,
        metalness: 0.0,
        transparent: false,
        opacity: 1.0
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Lay it flat
    floor.position.y = 0; // Position at ground level
    floor.receiveShadow = true;
    scene.add(floor);
}

// Create retro pixelated floor texture with color theory
function createRetroFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    
    // Disable anti-aliasing for crisp pixels
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Color theory: Monochromatic with accent (deep blues with warm accent)
    const colors = {
        bg: '#0f172a',        // Deep slate blue (primary)
        grid1: '#1e293b',     // Medium slate blue (tint)
        grid2: '#334155',     // Light slate blue (tint)
        accent: '#f59e0b'      // Warm amber (complementary accent)
    };

    // Fill background
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, 512, 512);

    // Create pixelated grid pattern
    const gridSize = 32;
    const pixelSize = 4;
    
    for (let x = 0; x < 512; x += gridSize) {
        for (let y = 0; y < 512; y += gridSize) {
            // Alternate grid colors
            const color = (x + y) % (gridSize * 2) === 0 ? colors.grid1 : colors.grid2;
            context.fillStyle = color;
            context.fillRect(x, y, gridSize, gridSize);
            
            // Add pixelated border
            context.fillStyle = colors.accent;
            context.fillRect(x, y, pixelSize, pixelSize);
            context.fillRect(x + gridSize - pixelSize, y, pixelSize, pixelSize);
            context.fillRect(x, y + gridSize - pixelSize, pixelSize, pixelSize);
            context.fillRect(x + gridSize - pixelSize, y + gridSize - pixelSize, pixelSize, pixelSize);
        }
    }

    // Add some retro pixel art elements scattered around
    addRetroFloorElements(context, colors);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20); // Repeat the texture for infinite floor
    
    return texture;
}

// Add retro pixel art elements to the floor
function addRetroFloorElements(context, colors) {
    // Add some retro symbols
    const symbols = [
        { x: 64, y: 64, pattern: [" ██ ", "████", " ██ "] },
        { x: 256, y: 128, pattern: ["██", "██"] },
        { x: 384, y: 256, pattern: [" █ ", "███", " █ "] },
        { x: 128, y: 384, pattern: ["███", " █ ", "███"] }
    ];

    symbols.forEach(symbol => {
        drawPixelArt(context, symbol.x, symbol.y, symbol.pattern, colors.accent);
    });
}

// Helper function to draw pixel art
function drawPixelArt(context, startX, startY, pattern, color) {
    const pixelSize = 4;
    context.fillStyle = color;
    
    pattern.forEach((row, y) => {
        row.split('').forEach((pixel, x) => {
            if (pixel === '█') {
                context.fillRect(
                    startX + x * pixelSize, 
                    startY + y * pixelSize, 
                    pixelSize, 
                    pixelSize
                );
            }
        });
    });
} 