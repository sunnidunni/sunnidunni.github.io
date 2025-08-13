import * as THREE from 'three';

// === RETRO PIXEL ART TEXTURES WITH COLOR THEORY ===

// Create retro pixel art texture for About Me
export function createAboutMeTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    // Disable anti-aliasing for crisp pixels
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Color theory: Analogous color scheme (blue-green family)
    const colors = {
        bg1: '#1e3a8a',      // Deep blue (primary)
        bg2: '#1e40af',      // Medium blue (analogous)
        border: '#fbbf24',    // Warm yellow (complementary to blue)
        text: '#f8fafc',      // Off-white (high contrast)
        accent1: '#10b981',   // Emerald green (analogous)
        accent2: '#f59e0b'    // Amber (warm accent)
    };

    // Create pixelated background
    const pixelSize = 8;
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 0; y < height; y += pixelSize) {
            const color = (x + y) % (pixelSize * 2) === 0 ? colors.bg1 : colors.bg2;
            context.fillStyle = color;
            context.fillRect(x, y, pixelSize, pixelSize);
        }
    }

    // Add retro border pattern
    context.strokeStyle = colors.border;
    context.lineWidth = 4;
    
    // Pixelated border
    for (let i = 0; i < 4; i++) {
        context.strokeRect(20 + i * 2, 20 + i * 2, width - 40 - i * 4, height - 40 - i * 4);
    }

    // Add retro pixel art elements
    drawPixelArt(context, width / 2 - 60, height / 2 - 100, [
        "  ████  ",
        " ██████ ",
        "████████",
        " ██████ ",
        "  ████  "
    ], colors.accent1);

    // Text with authentic pixel font
    context.font = 'bold 60px "Press Start 2P"';
    context.fillStyle = colors.text;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add pixelated text shadow
    context.shadowColor = colors.border;
    context.shadowBlur = 0;
    context.shadowOffsetX = 4;
    context.shadowOffsetY = 4;
    
    context.fillText('ABOUT ME', width / 2, height / 2);

    // Add retro accent pixels
    context.fillStyle = colors.accent2;
    for (let i = 0; i < 8; i++) {
        const x = 30 + i * 60;
        const y = height - 50;
        context.fillRect(x, y, 4, 4);
    }

    return new THREE.CanvasTexture(canvas);
}

// Create retro pixel art texture for Projects
export function createProjectsTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Color theory: Triadic color scheme (purple, green, orange)
    const colors = {
        bg1: '#581c87',      // Deep purple (primary)
        bg2: '#7c3aed',      // Medium purple (analogous)
        border: '#06b6d4',    // Cyan (complementary to purple)
        text: '#f8fafc',      // Off-white (high contrast)
        accent1: '#10b981',   // Emerald green (triadic)
        accent2: '#f97316'    // Orange (triadic)
    };

    // Create tech grid background
    const gridSize = 16;
    context.fillStyle = colors.bg1;
    context.fillRect(0, 0, width, height);
    
    context.strokeStyle = colors.bg2;
    context.lineWidth = 1;
    for (let x = 0; x < width; x += gridSize) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
        context.moveTo(0, y);
        context.lineTo(width, y);
    }
    context.stroke();

    // Add retro border
    context.strokeStyle = colors.border;
    context.lineWidth = 3;
    context.strokeRect(15, 15, width - 30, height - 30);

    // Add retro computer icon
    drawPixelArt(context, width / 2 - 40, height / 2 - 80, [
        "████████",
        "█      █",
        "█ ████ █",
        "█ ████ █",
        "█ ████ █",
        "█      █",
        "████████"
    ], colors.accent1);

    // Text with authentic pixel font
    context.font = 'bold 55px "Press Start 2P"';
    context.fillStyle = colors.text;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.shadowColor = colors.border;
    context.shadowBlur = 0;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
    
    context.fillText('PROJECTS', width / 2, height / 2 + 20);

    // Add tech accent pixels
    context.fillStyle = colors.accent2;
    for (let i = 0; i < 6; i++) {
        const x = 40 + i * 80;
        const y = height - 40;
        context.fillRect(x, y, 6, 6);
    }

    return new THREE.CanvasTexture(canvas);
}

// Create retro pixel art texture for Contact
export function createContactTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Color theory: Split-complementary (red with blue-green and yellow-green)
    const colors = {
        bg1: '#dc2626',      // Red (primary)
        bg2: '#b91c1c',      // Darker red (shade)
        border: '#10b981',    // Emerald green (complementary)
        text: '#f8fafc',      // Off-white (high contrast)
        accent1: '#fbbf24',   // Amber (warm accent)
        accent2: '#06b6d4'    // Cyan (cool accent)
    };

    // Create pixelated background
    const pixelSize = 6;
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 0; y < height; y += pixelSize) {
            const color = (x + y) % (pixelSize * 3) === 0 ? colors.bg1 : colors.bg2;
            context.fillStyle = color;
            context.fillRect(x, y, pixelSize, pixelSize);
        }
    }

    // Add retro border
    context.strokeStyle = colors.border;
    context.lineWidth = 4;
    context.strokeRect(20, 20, width - 40, height - 40);

    // Add retro heart icon
    drawPixelArt(context, width / 2 - 30, height / 2 - 80, [
        " ██ ██ ",
        "████████",
        "████████",
        " ██████ ",
        "  ████  ",
        "   ██   "
    ], colors.accent2);

    // Text with authentic pixel font
    context.font = 'bold 50px "Press Start 2P"';
    context.fillStyle = colors.text;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.shadowColor = colors.border;
    context.shadowBlur = 0;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
    
    context.fillText('CONTACT', width / 2, height / 2 + 20);

    // Add retro accent pixels
    context.fillStyle = colors.accent1;
    for (let i = 0; i < 7; i++) {
        const x = 35 + i * 70;
        const y = height - 45;
        context.fillRect(x, y, 5, 5);
    }

    return new THREE.CanvasTexture(canvas);
}

// Helper function to draw pixel art
function drawPixelArt(context, startX, startY, pattern, color) {
    const pixelSize = 8;
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

// Legacy function for backward compatibility
export function createTextTexture(type, width, height) {
    switch (type){
        case 'About Me':
            return createAboutMeTexture(width, height);
        case 'Projects':
            return createProjectsTexture(width, height);
        case 'Contact':
            return createContactTexture(width, height);

    }
    
} 