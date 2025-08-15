import * as THREE from 'three';

// === CUTE WANDERING DOG MODEL (IMPROVED AI) ===
export class WanderingDog {
    constructor(scene, camera, objectsToAvoid = []) {
        this.scene = scene;
        this.camera = camera;
        this.dog = null;
        this.clock = new THREE.Clock();
        
        // Movement properties
        this.wanderSpeed = 1.2;
        this.fleeSpeed = 10;
        this.currentSpeed = this.wanderSpeed;
        this.wanderRadius = 15;
        this.currentTarget = new THREE.Vector3();
        this.isMoving = false;
        this.moveDirection = new THREE.Vector3(0, 0, 1);
        this.rotationSpeed = 0.08;
        
        // Cursor avoidance properties
        this.isFleeingFromCursor = false;
        this.cursorPosition = new THREE.Vector3();
        this.fleeDistance = 8;
        this.safeDistance = 12;
        
        // Animation states
        this.isBarking = false;
        this.barkDuration = 1500;
        
        // Sound effects
        this.audioContext = null;
        this.setupAudio();
        
        // --- IMPROVED COLLISION AVOIDANCE ---
        this.objectsToAvoid = objectsToAvoid;
        this.raycaster = new THREE.Raycaster(); // General purpose raycaster
        this.collisionWhiskers = [
            new THREE.Vector3(0, 0, 1),      // Forward
            new THREE.Vector3(0.5, 0, 0.8),   // Angled Right
            new THREE.Vector3(-0.5, 0, 0.8)   // Angled Left
        ];
        this.collisionDistance = 2.5; // Increased slightly for better look-ahead
        this.mouse = new THREE.Vector2();


        this.createDog();
        this.startWandering();
        this.setupCursorTracking();
    }

    setupCursorTracking() {
        const onMouseMove = (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        };
        window.addEventListener('mousemove', onMouseMove, false);
    }
    
    updateCursorWorldPosition() {
        if (!this.camera) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
        
        if (intersectionPoint) {
            this.cursorPosition.copy(intersectionPoint);
        }
    }


    checkCursorDistance() {
        if (!this.dog || this.isBarking) return;

        const distanceToCursor = this.dog.position.distanceTo(this.cursorPosition);
        
        if (distanceToCursor < this.fleeDistance) {
            if (!this.isFleeingFromCursor) {
                this.isFleeingFromCursor = true;
                this.isMoving = true; // Ensure movement starts
            }
            this.currentSpeed = this.fleeSpeed;
        } else if (distanceToCursor > this.safeDistance && this.isFleeingFromCursor) {
            this.isFleeingFromCursor = false;
            this.currentSpeed = this.wanderSpeed;
            this.generateNewTarget();
        }
    }
    checkMouseHoverOnDog() {
        if (!this.dog || !this.camera) return false;
    
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.dog, true);
    
        return intersects.length > 0;
    }

    avoidCollisions() {
        let collided = false;
    
        this.collisionWhiskers.forEach(whisker => {
            const whiskerDirection = whisker.clone().applyQuaternion(this.dog.quaternion).normalize();
            this.raycaster.set(this.dog.position, whiskerDirection);
    
            const checkableObjects = this.scene.children.filter(obj => obj !== this.dog);
            const intersects = this.raycaster.intersectObjects(checkableObjects, true);
    
            if (intersects.length > 0 && intersects[0].distance < this.collisionDistance) {
                collided = true;
            }
        });
    
        if (collided) {
            this.jumpOver();
        }
    
        return new THREE.Vector3(); // No steering away
    }
    jumpOver() {
    if (this.isJumping) return; // Avoid double jumps
    this.isJumping = true;

    const jumpHeight = 1; // meters
    const jumpDuration = 300; // ms
    const originalY = this.dog.position.y;

    // Up
    new TWEEN.Tween(this.dog.position)
        .to({ y: originalY + jumpHeight }, jumpDuration / 2)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            // Down
            new TWEEN.Tween(this.dog.position)
                .to({ y: originalY }, jumpDuration / 2)
                .easing(TWEEN.Easing.Quadratic.In)
                .onComplete(() => {
                    this.isJumping = false;
                })
                .start();
        })
        .start();
}



    update() {
        const deltaTime = this.clock.getDelta();
        if (!this.dog) return;

        // Update animations (tail, legs, idle)
        this.updateAnimations();
        
        
        // Always track the cursor's world position
        this.updateCursorWorldPosition();
        
        // Determine the dog's current state (fleeing, wandering, etc.)
        this.checkCursorDistance();

        if (this.isBarking) {
            this.isMoving = false;
        } else if (this.isFleeingFromCursor) {
            // --- DYNAMIC FLEEING LOGIC ---
            // 1. Calculate the ideal flee direction (directly away from cursor)
            const fleeDirection = new THREE.Vector3()
                .subVectors(this.dog.position, this.cursorPosition)
                .normalize();

            // 2. Calculate steering force to avoid obstacles
            const avoidanceDirection = this.avoidCollisions();

            // 3. Combine the two directions for intelligent movement
            // We give a strong weight to avoidance to make sure it doesn't hit walls
            this.moveDirection.addVectors(fleeDirection, avoidanceDirection.multiplyScalar(2.0)).normalize();
            this.isMoving = true;

        } else if (this.isMoving) {
            // Wandering movement
            const distanceToTarget = this.dog.position.distanceTo(this.currentTarget);
            if (distanceToTarget > 1.0) {
                const wanderDirection = new THREE.Vector3()
                    .subVectors(this.currentTarget, this.dog.position)
                    .normalize();
                
                const avoidanceDirection = this.avoidCollisions();
                this.moveDirection.addVectors(wanderDirection, avoidanceDirection).normalize();

            } else {
                this.isMoving = false;
            }
        }
        if (this.checkMouseHoverOnDog()) {
            this.isMoving = false;
            return; // Skip rest of update
        }

        
        // --- UNIFIED MOVEMENT AND ROTATION LOGIC ---
        if (this.isMoving) {
            // Move the dog
            this.dog.position.add(
                this.moveDirection.clone().multiplyScalar(this.currentSpeed * deltaTime)
            );
            
            // Smoothly rotate the dog to face the move direction
            const targetRotation = Math.atan2(this.moveDirection.x, this.moveDirection.z);
            let rotationDiff = targetRotation - this.dog.rotation.y;
            
            // Ensure shortest rotation path
            if (Math.abs(rotationDiff) > Math.PI) {
                rotationDiff += rotationDiff > 0 ? -2 * Math.PI : 2 * Math.PI;
            }
            
            const rotSpeed = this.isFleeingFromCursor ? this.rotationSpeed * 2.5 : this.rotationSpeed;
            this.dog.rotation.y += rotationDiff * rotSpeed;
        }
    }

    updateAnimations() {
        // Animate tail wagging (faster when fleeing)
        if (this.tail) {
            const wagSpeed = this.isFleeingFromCursor ? 0.02 : 0.01;
            const wagAmount = this.isFleeingFromCursor ? 0.4 : 0.2;
            this.tail.rotation.y = Math.sin(Date.now() * wagSpeed) * wagAmount;
        }

        // Animate legs (faster when fleeing)
        if (this.isMoving && !this.isBarking) {
            const stepSpeed = this.isFleeingFromCursor ? 0.025 : 0.015;
            const stepAmount = this.isFleeingFromCursor ? 0.6 : 0.4;
            const walkTime = Date.now() * stepSpeed;
            this.legs.forEach((leg, index) => {
                leg.rotation.x = Math.sin(walkTime + (index % 2 === 0 ? 0 : Math.PI)) * stepAmount;
            });
        } else {
            // Legs return to neutral
            this.legs.forEach(leg => { leg.rotation.x *= 0.8; });
        }
        
        // Subtle idle animation
        if (!this.isMoving && !this.isBarking && this.head) {
            const idleTime = Date.now() * 0.002;
            this.head.position.y = 1.2 + Math.sin(idleTime) * 0.03;
        }
    }

    // --- Other methods (createDog, bark, audio, etc.) remain largely the same ---
    
    setupAudio() {
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
        
        const dogMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF }); // White base
        const patchMaterial = new THREE.MeshLambertMaterial({ color: 0xFFE4B5 }); // Yellowish orange patches
        const noseMaterial = new THREE.MeshLambertMaterial({ color: 0xFF69B4 }); // Pink nose
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 }); // Black eyes
    
        // Cat body - smaller and more compact
        const bodyGeometry = new THREE.BoxGeometry(0.8, 0.6, 1.4);
        const body = new THREE.Mesh(bodyGeometry, dogMaterial);
        body.position.y = 0.9;
        dogGroup.add(body);
    
        // Cat head - rounder
        const headGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
        const head = new THREE.Mesh(headGeometry, dogMaterial);
        head.position.set(0, 1.1, 1.0);
        dogGroup.add(head);
    
        // Cat muzzle - smaller and more delicate
        const snoutGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.3);
        const snout = new THREE.Mesh(snoutGeometry, dogMaterial);
        snout.position.set(0, 1.0, 1.4);
        dogGroup.add(snout);
        
        // Cat eyes - slightly larger
        const eyeGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.1);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 1.2, 1.4);
        dogGroup.add(leftEye);
    
        const rightEye = leftEye.clone();
        rightEye.position.x = 0.15;
        dogGroup.add(rightEye);
    
        // Cat nose - smaller and pink
        const noseGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(0, 1.05, 1.65);
        dogGroup.add(nose);
    
        // Cat ears - triangular and pointed upward
        const earGeometry = new THREE.ConeGeometry(0.2, 0.5, 3);
        const leftEar = new THREE.Mesh(earGeometry, patchMaterial); // Yellowish orange ears
        leftEar.position.set(-0.25, 1.5, 0.9);
        leftEar.rotation.z = -0.1;
        dogGroup.add(leftEar);
    
        const rightEar = leftEar.clone();
        rightEar.position.x = 0.25;
        rightEar.rotation.z = 0.1;
        dogGroup.add(rightEar);
    
        // Cat legs - thinner
        const legGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        const frontLeftLeg = new THREE.Mesh(legGeometry, dogMaterial);
        frontLeftLeg.position.set(-0.3, 0.35, 0.6);
        dogGroup.add(frontLeftLeg);
    
        const frontRightLeg = frontLeftLeg.clone();
        frontRightLeg.position.x = 0.3;
        dogGroup.add(frontRightLeg);
    
        const backLeftLeg = frontLeftLeg.clone();
        backLeftLeg.position.z = -0.6;
        backLeftLeg.position.x = -0.3;
        dogGroup.add(backLeftLeg);
    
        const backRightLeg = backLeftLeg.clone();
        backRightLeg.position.x = 0.3;
        dogGroup.add(backRightLeg);
    
        // Cat tail - longer and more flexible
        const tailGeometry = new THREE.BoxGeometry(0.15, 0.15, 1.0);
        const tail = new THREE.Mesh(tailGeometry, patchMaterial); // Yellowish orange tail
        tail.position.set(0, 1.1, -1.2);
        tail.rotation.x = Math.PI / 6; // More upright like a cat
        dogGroup.add(tail);
    
        // Add yellowish orange patches
        const patch1Geometry = new THREE.BoxGeometry(0.4, 0.62, 0.7);
        const patch1 = new THREE.Mesh(patch1Geometry, patchMaterial);
        patch1.position.set(0.2, 0.9, 0.25);
        dogGroup.add(patch1);
    
        const patch2Geometry = new THREE.BoxGeometry(0.35, 0.72, 0.35);
        const patch2 = new THREE.Mesh(patch2Geometry, patchMaterial);
        patch2.position.set(-0.175, 1.1, 1.0);
        dogGroup.add(patch2);
    
        dogGroup.position.set(10, 0, 10);
        // We set the initial direction based on the default dog rotation
        dogGroup.lookAt(dogGroup.position.x, dogGroup.position.y, dogGroup.position.z + 1);
        
        this.dog = dogGroup;
        this.head = head;
        this.tail = tail;
        this.ears = [leftEar, rightEar];
        this.legs = [frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg];
        
        this.scene.add(this.dog);
    }
    
    startWandering() {
        this.generateNewTarget();
        setInterval(() => {
            if (!this.isMoving && !this.isBarking && !this.isFleeingFromCursor) {
                // Add a small chance to bark instead of wandering
                if (Math.random() < 0.2) {
                    this.bark();
                } else {
                    this.generateNewTarget();
                }
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
        this.currentSpeed = this.wanderSpeed;
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
        const originalHeadPos = this.head.position.y;
        this.head.position.y += 0.1;
        this.playBarkSound();
        setTimeout(() => {
             this.head.position.y = originalHeadPos;
             this.playBarkSound();
        }, 200);
        setTimeout(() => {
            this.isBarking = false;
        }, this.barkDuration);
    }
    
    onClick() {
        this.bark();
    }

    getIntersectable() {
        return this.dog ? [this.dog] : [];
    }

    dispose() {
        if (this.dog) {
            this.scene.remove(this.dog);
            this.dog.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.isMaterial) child.material.dispose();
                }
            });
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        // Remove event listener
        window.removeEventListener('mousemove', this.setupCursorTracking);
    }
}

// The setup function remains the same, but now you must pass the camera for cursor tracking
export function setupWanderingDog(scene, camera, objectsToAvoid) {
    const dog = new WanderingDog(scene, camera, objectsToAvoid);
    return dog;
}