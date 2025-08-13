import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { camera, renderer } from './scene.js';

// === CONTROLS SETUP ===
export function setupControls() {
	const controls = new OrbitControls(camera, renderer.domElement);

	// --- Core Setup ---
	controls.target.set(0, 0, 0);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;

	// --- Left-Click Pan ONLY ---
	controls.enableRotate = false;
	controls.enableZoom = false;
	controls.enablePan = true;
	controls.mouseButtons = {
		LEFT: THREE.MOUSE.PAN,
		MIDDLE: THREE.MOUSE.DO_NOTHING,
		RIGHT: THREE.MOUSE.DO_NOTHING,
	};
	controls.screenSpacePanning = true;

	// --- Limits & Fixed Angle ---
	const panLimit = 10; // max horizontal distance from origin for target
	const fixedHeight = 20; // keep camera at a constant height

	// Capture initial offset to preserve viewing angle
	const initialOffset = camera.position.clone().sub(controls.target);
	const initialHorizontal = new THREE.Vector3(initialOffset.x, 0, initialOffset.z);
	const horizontalDistance = initialHorizontal.length();
	const horizontalDir = horizontalDistance > 0 ? initialHorizontal.clone().normalize() : new THREE.Vector3(0, 0, 1);

	// Override the update method to enforce our constraints
	const originalUpdate = controls.update.bind(controls);
	controls.update = function() {
		// Let controls consume input (panning), then clamp/apply constraints
		originalUpdate();

		// Clamp target to a horizontal circle of radius panLimit
		const t = controls.target;
		const targetDist = Math.hypot(t.x, t.z);
		if (targetDist > panLimit) {
			const angle = Math.atan2(t.z, t.x);
			t.x = Math.cos(angle) * panLimit;
			t.z = Math.sin(angle) * panLimit;
		}
		// Keep target on ground plane
		t.y = 0;

		// Re-apply a constant camera offset to preserve angle and distance
		camera.position.set(
			t.x + horizontalDir.x * horizontalDistance,
			fixedHeight,
			t.z + horizontalDir.z * horizontalDistance
		);
		camera.lookAt(t);
	};

	return controls;
}