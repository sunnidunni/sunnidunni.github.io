# 3D Portfolio Website - Modular Structure

This 3D portfolio website is built with Three.js and organized into modular, maintainable JavaScript files.

## 📁 File Structure

```
js/
├── main.js           # Main application entry point
├── scene.js          # Three.js scene, camera, and renderer setup
├── lighting.js       # Lighting configuration and setup
├── floor.js          # Floor and environment setup
├── particles.js      # Particle system and animations
├── textures.js       # Text texture creation and styling
├── portfolioItems.js # Portfolio items creation and management
├── controls.js       # Camera controls and distance-based resistance
├── interaction.js    # Mouse interactions, raycasting, and modals
└── loading.js        # Loading screen functionality
```

## 🚀 How It Works

### **main.js** - Application Entry Point
- Initializes the `PortfolioApp` class
- Orchestrates all component setup
- Manages the main animation loop

### **scene.js** - Core Three.js Setup
- Creates the main scene, camera, and renderer
- Sets up white background and fog
- Handles window resize events

### **lighting.js** - Professional Lighting
- 3-point lighting system (key, fill, rim)
- High-quality shadows with optimized settings
- Creates depth and atmosphere

### **floor.js** - Environment
- Infinite white floor
- Clean, minimal aesthetic
- Receives shadows for realism

### **particles.js** - Atmospheric Effects
- Subtle floating particles
- Configurable particle count and behavior
- Animation functions

### **textures.js** - Visual Design
- Modern glassmorphism backgrounds
- Gradient borders and accent elements
- Professional typography and styling

### **portfolioItems.js** - Content Management
- Creates portfolio cards with different orientations
- Handles materials and positioning
- Adds shadow effects for grounding

### **controls.js** - Camera Movement
- OrbitControls with custom damping
- Distance-based drag resistance
- Real-time distance indicator updates

### **interaction.js** - User Experience
- Mouse hover effects and click detection
- Raycasting for 3D object selection
- Modal system management

### **loading.js** - Loading States
- Loading screen functionality
- Smooth fade-out transitions

## 🔧 Benefits of This Structure

1. **Maintainability** - Each file has a single responsibility
2. **Readability** - Easy to find and modify specific features
3. **Reusability** - Components can be easily reused or modified
4. **Debugging** - Issues can be isolated to specific modules
5. **Collaboration** - Multiple developers can work on different modules
6. **Testing** - Individual modules can be tested separately

## 🎯 Key Features

- **3D Portfolio Cards** - Thick, modern design with different orientations
- **Infinite White Floor** - Clean, gallery-like environment
- **Distance-Based Navigation** - Drag resistance increases with distance
- **Interactive Elements** - Hover effects and click-to-open modals
- **Professional Lighting** - High-quality shadows and atmosphere
- **Responsive Design** - Adapts to different screen sizes

## 🚀 Getting Started

1. Ensure all files are in the `js/` directory
2. The main entry point is `main.js`
3. All modules are automatically imported and initialized
4. The application starts when the DOM is loaded

## 🔄 Adding New Features

To add new features:
1. Create a new module file (e.g., `newFeature.js`)
2. Export the necessary functions
3. Import and use in `main.js`
4. Follow the existing naming conventions

This modular structure makes the codebase much more professional and easier to maintain! 