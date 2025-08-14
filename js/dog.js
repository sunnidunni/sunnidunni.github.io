import * as THREE from 'three';

// === CUTE WANDERING DOG MODEL ===
export class WanderingDog {
    constructor(scene, objectsToAvoid = []) {
        this.scene = scene;
        this.dog = null;
        this.clock = new THREE.Clock();
        
        // Movement properties
        this.wanderSpeed = 1.2;
        this.wanderRadius = 15;
        this.currentTarget = new THREE.Vector3();
        this.isMoving = false;
        this.moveDirection = new THREE.Vector3();
        this.rotationSpeed = 0.08; // Slightly faster rotation
        
        // Animation states
        this.isBarking = false;
        this.barkDuration = 1500; // 1.5 seconds
        
        // Sound effects
        this.audioContext = null;
        this.setupAudio();
        
        // FIX 3: Collision Avoidance
        this.raycaster = new THREE.Raycaster();
        this.collisionDistance = 1.5; // How far the dog 'looks' ahead
        this.objectsToAvoid = objectsToAvoid; // Pass in other scene objects

        this.createDog();
        this.startWandering();
    }

    setupAudio() {
        // Resume audio context on first user interaction (good practice for browsers)
        const resumeAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            document.body.removeEventListener('click', resumeAudio);
        };
        document.body.addEventListener('click', resumeAudio);

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    
    createDog() {
        const dogGroup = new THREE.Group();
        
        const dogMaterial = new THREE.MeshLambertMaterial({ color: 0xD2691E }); // Saddle brown
        const noseMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 }); // Dark grey for nose
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });

        const bodyGeometry = new THREE.BoxGeometry(1, 0.8, 2);
        const body = new THREE.Mesh(bodyGeometry, dogMaterial);
        body.position.y = 1;
        dogGroup.add(body);

        const headGeometry = new THREE.BoxGeometry(0.9, 0.8, 0.8);
        const head = new THREE.Mesh(headGeometry, dogMaterial);
        head.position.set(0, 1.2, 1.2);
        dogGroup.add(head);

        const snoutGeometry = new THREE.BoxGeometry(0.5, 0.3, 0.4);
        const snout = new THREE.Mesh(snoutGeometry, dogMaterial);
        snout.position.set(0, 1.1, 1.6);
        dogGroup.add(snout);
        const eyeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.2, 1.3, 1.6);
        dogGroup.add(leftEye);

        const rightEye = leftEye.clone();
        rightEye.position.x = 0.2;
        dogGroup.add(rightEye);

        const noseGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(0, 1.15, 1.85);
        dogGroup.add(nose);

        const earGeometry = new THREE.BoxGeometry(0.3, 0.5, 0.2);
        const leftEar = new THREE.Mesh(earGeometry, dogMaterial);
        leftEar.position.set(-0.4, 1.7, 1.1);
        dogGroup.add(leftEar);

        const rightEar = leftEar.clone();
        rightEar.position.x = 0.4;
        dogGroup.add(rightEar);

        const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const frontLeftLeg = new THREE.Mesh(legGeometry, dogMaterial);
        frontLeftLeg.position.set(-0.35, 0.4, 0.6);
        dogGroup.add(frontLeftLeg);

        const frontRightLeg = frontLeftLeg.clone();
        frontRightLeg.position.x = 0.35;
        dogGroup.add(frontRightLeg);

        const backLeftLeg = frontLeftLeg.clone();
        backLeftLeg.position.z = -0.6;
        backLeftLeg.position.x = -0.35;
        dogGroup.add(backLeftLeg);

        const backRightLeg = backLeftLeg.clone();
        backRightLeg.position.x = 0.35;
        dogGroup.add(backRightLeg);

        const tailGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        const tail = new THREE.Mesh(tailGeometry, dogMaterial);
        tail.position.set(0, 1.1, -1.2);
        tail.rotation.x = Math.PI / 4;
        dogGroup.add(tail);

        // Position dog in scene
        dogGroup.position.set(10, 0, 10);

        const collisionGeometry = new THREE.BoxGeometry(1.2, 1.2, 2.2); // Sized to fit the dog
        const collisionMaterial = new THREE.MeshBasicMaterial({ visible: false }); // Makes it invisible
        const collisionMesh = new THREE.Mesh(collisionGeometry, collisionMaterial);
        
        // This is crucial: we add the collision mesh to the group
        dogGroup.add(collisionMesh);
        
        // Store references
        this.dog = dogGroup;
        this.head = head;
        this.tail = tail;
        this.ears = [leftEar, rightEar];
        this.legs = [frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg];
        this.collisionMesh = collisionMesh;
        
        this.scene.add(this.dog);
    }

    startWandering() {
        this.generateNewTarget();
        setInterval(() => {
            if (!this.isMoving && !this.isBarking) {
                this.generateNewTarget();
            }
        }, 3000 + Math.random() * 4000);
    }

    generateNewTarget() {
        const angle = Math.random() * Math.PI * 2;
        const distance = 3 + Math.random() * (this.wanderRadius - 3);
        
        this.currentTarget.set(
            this.dog.position.x + Math.cos(angle) * distance,
            0,
            this.dog.position.z + Math.sin(angle) * distance
        );
        
        this.isMoving = true;
    }

    playBarkSound() {
        if (!this.audioContext || this.audioContext.state === 'suspended') return;

        try {
            const time = this.audioContext.currentTime;
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.frequency.setValueAtTime(220, time);
            oscillator.type = 'sawtooth';
            
            gainNode.gain.setValueAtTime(0, time);
            gainNode.gain.linearRampToValueAtTime(0.4, time + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start(time);
            oscillator.stop(time + 0.2);
        } catch (e) {
            console.error('Could not play bark sound:', e);
        }
    }

    bark() {
        if (this.isBarking) return;
        
        this.isBarking = true;
        this.isMoving = false;
        
        // Animate barking
        const originalHeadPos = this.head.position.y;
        this.head.position.y += 0.1;
        this.playBarkSound();
        
        setTimeout(() => {
             this.head.position.y = originalHeadPos;
             this.playBarkSound(); // Second bark
        }, 200);

        setTimeout(() => {
            this.isBarking = false;
            this.generateNewTarget();
        }, this.barkDuration);
    }
    
    update() {
        const deltaTime = this.clock.getDelta();
        if (!this.dog) return;

        // Animate tail wagging
        if (this.tail) {
            const time = Date.now() * 0.01;
            // FIX 2: Changed wag axis for new model
            this.tail.rotation.z = Math.sin(time) * 0.5; 
        }

        if (this.isMoving && !this.isBarking) {
            const walkTime = Date.now() * 0.015; // slightly faster walk cycle
            this.legs.forEach((leg, index) => {
                // Simple alternating leg animation
                leg.rotation.x = Math.sin(walkTime + (index % 2 === 0 ? 0 : Math.PI)) * 0.4;
            });
        } else {
            this.legs.forEach(leg => { leg.rotation.x *= 0.8; }); // Smoothly stop legs
        }

        // FIX 3: Collision Detection Logic
        if (this.isMoving && !this.isBarking) {
            // Set up the raycaster
            this.raycaster.set(this.dog.position, this.moveDirection);
            
            // Get a list of objects to check for collisions, excluding the dog itself
            const obstacles = this.scene.children.filter(obj => obj !== this.dog);
            const intersects = this.raycaster.intersectObjects(obstacles, true);

            if (intersects.length > 0 && intersects[0].distance < this.collisionDistance) {
                // Collision detected! Stop moving and find a new path.
                this.isMoving = false;
                // Optional: make the dog "react" by barking
                // this.bark(); 
                
                // Immediately find a new target
                setTimeout(() => this.generateNewTarget(), 100);
            }
        }
        
        // Handle wandering movement
        if (this.isMoving && !this.isBarking) {
            const distanceToTarget = this.dog.position.distanceTo(this.currentTarget);
            
            if (distanceToTarget > 1.0) {
                // Move toward target
                this.moveDirection.subVectors(this.currentTarget, this.dog.position).normalize();
                
                this.dog.position.add(
                    this.moveDirection.clone().multiplyScalar(this.wanderSpeed * deltaTime)
                );
                
                // FIX 1: Adjusted rotation to account for model facing +X axis
                const targetRotation = Math.atan2(this.moveDirection.x, this.moveDirection.z);
                const currentRotation = this.dog.rotation.y;
                let rotationDiff = targetRotation - currentRotation;
                
                // Ensure the dog takes the shortest path to rotate
                if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
                if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
                
                this.dog.rotation.y += rotationDiff * this.rotationSpeed;
                
            } else {
                this.isMoving = false; // Reached target
            }
        }
        
        // Subtle idle animation
        if (!this.isMoving && !this.isBarking && this.head) {
            const time = Date.now() * 0.002;
            this.head.position.y = 1.2 + Math.sin(time) * 0.03;
        }
    }

    onClick() {
        console.log('hi')
        this.bark();
    }
    getIntersectable() {
        return this.dogGroup.children;
    }


    dispose() {
        if (this.dog) {
            this.scene.remove(this.dog);
            this.dog.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Example of how to use the class
export function setupWanderingDog(scene, objectsToAvoid) {
    const dog = new WanderingDog(scene, objectsToAvoid);
    return dog;
}