import * as THREE from 'three';

// === ENHANCED RETRO PIXEL ART TEXTURES WITH IMPROVED COLOR THEORY ===

// Create enhanced retro pixel art texture for About Me
export function createAboutMeTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    // Disable anti-aliasing for crisp pixels
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Enhanced color theory: Ocean depth theme with better contrast
    const colors = {
        bg1: '#0f172a',      // Slate 900 (deep ocean)
        bg2: '#1e293b',      // Slate 800 (medium depth)
        bg3: '#334155',      // Slate 600 (shallow water)
        border: '#22d3ee',   // Cyan 400 (electric blue)
        text: '#f1f5f9',     // Slate 100 (crisp white)
        accent1: '#06b6d4',  // Cyan 500 (ocean blue)
        accent2: '#0ea5e9',  // Sky 500 (bright blue)
        glow: '#67e8f9'      // Cyan 300 (light glow)
    };

    // Create animated wave-like background
    context.fillStyle = colors.bg1;
    context.fillRect(0, 0, width, height);

    const pixelSize = 10;
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 0; y < height; y += pixelSize) {
            const wave = Math.sin((x + y) * 0.02) * 0.5 + 0.5;
            if (wave > 0.6) {
                context.fillStyle = colors.bg2;
            } else if (wave > 0.3) {
                context.fillStyle = colors.bg3;
            } else {
                context.fillStyle = colors.bg1;
            }
            context.fillRect(x, y, pixelSize, pixelSize);
        }
    }

    // Enhanced border with glow effect
    context.strokeStyle = colors.border;
    context.lineWidth = 6;
    context.shadowColor = colors.glow;
    context.shadowBlur = 8;
    context.strokeRect(25, 25, width - 50, height - 50);
    
    // Reset shadow for clean inner elements
    context.shadowBlur = 0;

    // Add enhanced profile icon
    drawPixelArt(context, width / 2 - 60, height / 2 - 140, [
        "    ████████    ",
        "  ████████████  ",
        " ██████████████ ",
        "████████████████",
        "████  ████  ████",
        "████  ████  ████",
        "████████████████",
        "████  ██████  ██",
        "████████████████",
        " ██████████████ ",
        "  ████████████  ",
        "    ████████    "
    ], colors.accent1);

    // Enhanced text with multiple shadow layers
    context.font = 'bold 64px "Press Start 2P", monospace';
    context.fillStyle = colors.text;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Multi-layer shadow for depth
    context.fillStyle = colors.bg1;
    context.fillText('ABOUT ME', width / 2 + 6, height / 2 + 6);
    context.fillStyle = colors.border;
    context.fillText('ABOUT ME', width / 2 + 3, height / 2 + 3);
    context.fillStyle = colors.text;
    context.fillText('ABOUT ME', width / 2, height / 2);

    // Enhanced decorative elements
    context.fillStyle = colors.accent2;
    for (let i = 0; i < 10; i++) {
        const x = 40 + i * 50;
        const y = height - 60 + Math.sin(i * 0.5) * 10;
        context.fillRect(x, y, 8, 8);
        context.fillRect(x + 2, y + 2, 4, 4);
    }

    return new THREE.CanvasTexture(canvas);
}

// Create enhanced retro pixel art texture for Projects
export function createProjectsTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Enhanced color theory: Cyberpunk theme with neon accents
    const colors = {
        bg1: '#1a0b2e',      // Deep purple (cyber base)
        bg2: '#16213e',      // Dark blue-purple
        bg3: '#0f3460',      // Electric blue
        border: '#e879f9',   // Fuchsia 400 (neon pink)
        text: '#f8fafc',     // Slate 50 (clean white)
        accent1: '#22c55e',  // Green 500 (matrix green)
        accent2: '#f59e0b',  // Amber 500 (warning orange)
        glow: '#c084fc'      // Purple 400 (soft glow)
    };

    // Create circuit board background
    context.fillStyle = colors.bg1;
    context.fillRect(0, 0, width, height);
    
    const gridSize = 20;
    context.strokeStyle = colors.bg2;
    context.lineWidth = 2;
    
    // Draw circuit lines
    for (let x = 0; x < width; x += gridSize) {
        for (let y = 0; y < height; y += gridSize) {
            if (Math.random() > 0.7) {
                context.strokeStyle = colors.bg3;
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x + gridSize, y);
                context.lineTo(x + gridSize, y + gridSize);
                context.stroke();
            }
        }
    }

    // Enhanced border with glow
    context.strokeStyle = colors.border;
    context.lineWidth = 8;
    context.shadowColor = colors.glow;
    context.shadowBlur = 12;
    context.strokeRect(20, 20, width - 40, height - 40);
    context.shadowBlur = 0;

    // Add enhanced computer/code icon
    drawPixelArt(context, width / 2 - 60, height / 2 - 140, [
        "████████████████████",
        "█                  █",
        "█  ████    ████    █",
        "█  ████    ████    █",
        "█                  █",
        "█  ████████████    █",
        "█  ████████████    █",
        "█                  █",
        "█  ████    ████    █",
        "█  ████    ████    █",
        "█                  █",
        "████████████████████"
    ], colors.accent1);

    // Enhanced text
    context.font = 'bold 60px "Press Start 2P", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.fillStyle = colors.bg1;
    context.fillText('PROJECTS', width / 2 + 5, height / 2 + 25);
    context.fillStyle = colors.border;
    context.fillText('PROJECTS', width / 2 + 2, height / 2 + 22);
    context.fillStyle = colors.text;
    context.fillText('PROJECTS', width / 2, height / 2 + 20);

    // Add circuit nodes
    context.fillStyle = colors.accent2;
    for (let i = 0; i < 8; i++) {
        const x = 50 + i * 80;
        const y = height - 50;
        context.fillRect(x - 4, y - 4, 8, 8);
        context.fillStyle = colors.accent1;
        context.fillRect(x - 2, y - 2, 4, 4);
        context.fillStyle = colors.accent2;
    }

    return new THREE.CanvasTexture(canvas);
}

// Create enhanced retro pixel art texture for Contact
export function createContactTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    
    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';

    // Enhanced color theory: Warm sunset theme
    const colors = {
        bg1: '#7c2d12',      // Orange 800 (sunset base)
        bg2: '#ea580c',      // Orange 600 (warm middle)
        bg3: '#fb923c',      // Orange 400 (bright highlight)
        border: '#06b6d4',   // Cyan 500 (cool contrast)
        text: '#fef7cd',     // Yellow 50 (warm white)
        accent1: '#eab308',  // Yellow 500 (sun yellow)
        accent2: '#ec4899',  // Pink 500 (vibrant pink)
        glow: '#fbbf24'      // Amber 400 (warm glow)
    };

    // Create sunset gradient background
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colors.bg3);
    gradient.addColorStop(0.5, colors.bg2);
    gradient.addColorStop(1, colors.bg1);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // Add texture overlay
    const pixelSize = 8;
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 0; y < height; y += pixelSize) {
            if (Math.random() > 0.8) {
                context.fillStyle = colors.bg3 + '40';
                context.fillRect(x, y, pixelSize, pixelSize);
            }
        }
    }

    // Enhanced border
    context.strokeStyle = colors.border;
    context.lineWidth = 7;
    context.shadowColor = colors.glow;
    context.shadowBlur = 10;
    context.strokeRect(25, 25, width - 50, height - 50);
    context.shadowBlur = 0;

    // Add enhanced communication icon
    drawPixelArt(context, width / 2 - 60, height / 2 - 140, [
        "  ████████████  ",
        " ██████████████ ",
        "████████████████",
        "████        ████",
        "████  ████  ████",
        "████  ████  ████",
        "████  ████  ████",
        "████        ████",
        "████████████████",
        " ██████████████ ",
        "  ████████████  ",
        "      ████      "
    ], colors.accent1);

    // Enhanced text
    context.font = 'bold 56px "Press Start 2P", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.fillStyle = colors.bg1;
    context.fillText('CONTACT', width / 2 + 4, height / 2 + 24);
    context.fillStyle = colors.border;
    context.fillText('CONTACT', width / 2 + 2, height / 2 + 22);
    context.fillStyle = colors.text;
    context.fillText('CONTACT', width / 2, height / 2 + 20);

    // Add decorative hearts
    context.fillStyle = colors.accent2;
    for (let i = 0; i < 9; i++) {
        const x = 40 + i * 60;
        const y = height - 55 + Math.cos(i * 0.7) * 8;
        drawPixelArt(context, x - 12, y - 12, [
            " ██ ██ ",
            "████████",
            " ██████ ",
            "  ████  ",
            "   ██   "
        ], colors.accent2);
    }

    return new THREE.CanvasTexture(canvas);
}

// Enhanced helper function to draw pixel art
function drawPixelArt(context, startX, startY, pattern, color) {
    const pixelSize = 6;
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

// Enhanced legacy function for backward compatibility
export function createTextTexture(type, width, height) {
    switch (type) {
        case 'About Me':
            return createAboutMeTexture(width, height);
        case 'Projects':
            return createProjectsTexture(width, height);
        case 'Contact':
            return createContactTexture(width, height);
        default:
            return createAboutMeTexture(width, height);
    }
}