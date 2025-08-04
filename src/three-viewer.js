// src/three-viewer.js

// Imports
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SpriteText from 'three-spritetext';
import { extractPerimeterEdges, extractSegmentsAtZ, segmentsToPolyline } from './mesh-processor.js';

// Module-level variables
let scene, camera, renderer, controls, mainMesh, wireframeMesh, axesGroup;
let modelMaxDim = 10; // Default dimension for an empty scene
let selectionModeActive = false;

// Perimeters
let topPerimeter = [];
let bottomPerimeter = [];
let lowerQuarterPerimeter = [];
let middlePerimeter = [];
let upperQuarterPerimeter = [];

// Visual aids for perimeters
let topPerimeterLines, bottomPerimeterLines, lowerQuarterPerimeterLines, middlePerimeterLines, upperQuarterPerimeterLines;
const perimeterEndpoints = [];

// --- CAM Visualization ---
let camSolutionLines;

// --- Simulation Objects ---
let topWireGuide, bottomWireGuide, wire;

/**
 * Initializes the 3D viewer, scene, camera, and renderer.
 */
function init() {
    const container = document.getElementById('view-3d');
    if (!container) {
        console.error("3D view container not found");
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 100;
    camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
    camera.up.set(0, 0, 1); // Z-axis up

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Axes
    axesGroup = new THREE.Group();
    scene.add(axesGroup);
    drawAxes(10); // Initial small axes

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    container.addEventListener('click', onContainerClick);
    
    // Create simulation wire guides
    const guideGeometry = new THREE.ConeGeometry(2, 5, 8);
    
    const topGuideMaterial = new THREE.MeshPhongMaterial({ color: 0xffc0cb }); // Pink
    topWireGuide = new THREE.Mesh(guideGeometry, topGuideMaterial);
    topWireGuide.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)); // Point down -Z
    topWireGuide.visible = false;
    scene.add(topWireGuide);

    const bottomGuideMaterial = new THREE.MeshPhongMaterial({ color: 0x00ffff }); // Cyan
    bottomWireGuide = new THREE.Mesh(guideGeometry, bottomGuideMaterial);
    bottomWireGuide.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)); // Point up +Z
    bottomWireGuide.visible = false;
    scene.add(bottomWireGuide);

    // Create the wire
    const wireGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8); // Radius, height, segments
    const wireMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 }); // Yellow
    wire = new THREE.Mesh(wireGeometry, wireMaterial);
    // Position wire so it extends from center (0,0,0) to (0,0,1) by default
    wire.position.set(0, 0, 0.5);
    wire.visible = false;
    scene.add(wire);

    // Start render loop
    animate();
}

/**
 * Render loop.
 */
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

/**
 * Handles window resize events.
 */
function onWindowResize() {
    const container = document.getElementById('view-3d');
    const aspect = container.clientWidth / container.clientHeight;
    
    // Use the existing frustum size to recalculate bounds
    const frustumHeight = camera.top - camera.bottom;
    const frustumWidth = frustumHeight * aspect;

    camera.left = -frustumWidth / 2;
    camera.right = frustumWidth / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = -frustumHeight / 2;

    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Clears existing meshes, perimeters, and axes from the scene.
 */
function clearSceneArtifacts() {
    if (mainMesh) scene.remove(mainMesh);
    if (wireframeMesh) scene.remove(wireframeMesh);
    if (topPerimeterLines) scene.remove(topPerimeterLines);
    if (bottomPerimeterLines) scene.remove(bottomPerimeterLines);
    if (middlePerimeterLines) scene.remove(middlePerimeterLines);
    if (lowerQuarterPerimeterLines) scene.remove(lowerQuarterPerimeterLines);
    if (upperQuarterPerimeterLines) scene.remove(upperQuarterPerimeterLines);
    perimeterEndpoints.forEach(p => scene.remove(p));
    perimeterEndpoints.length = 0;
    if (camSolutionLines) scene.remove(camSolutionLines);
    
    mainMesh = null;
    wireframeMesh = null;
    topPerimeterLines = null;
    bottomPerimeterLines = null;
    middlePerimeterLines = null;
    lowerQuarterPerimeterLines = null;
    upperQuarterPerimeterLines = null;
    camSolutionLines = null;

    topPerimeter = [];
    bottomPerimeter = [];
    lowerQuarterPerimeter = [];
    middlePerimeter = [];
    upperQuarterPerimeter = [];

    while (axesGroup.children.length > 0) {
        axesGroup.remove(axesGroup.children[0]);
    }
}


/**
 * Loads and displays an STL file.
 * @param {File} file - The STL file to load.
 */
function loadSTL(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        clearSceneArtifacts();

        const contents = event.target.result;
        const loader = new STLLoader();
        const geometry = loader.parse(contents);
        
        // Center the geometry
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);

        // Calculate model dimensions
        const boundingBoxSize = box.getSize(new THREE.Vector3());
        modelMaxDim = Math.max(boundingBoxSize.x, boundingBoxSize.y, boundingBoxSize.z);
        if (modelMaxDim === 0) modelMaxDim = 10; // Fallback for empty/flat models

        // Create main mesh
        const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, specular: 0x111111, shininess: 200 });
        mainMesh = new THREE.Mesh(geometry, material);
        const meshToggle = document.getElementById('toggle-mesh-btn');
        mainMesh.visible = meshToggle.classList.contains('active');
        scene.add(mainMesh);

        // Create wireframe mesh
        const wireframeGeometry = new THREE.WireframeGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        wireframeMesh = new THREE.LineSegments(wireframeGeometry, lineMaterial);
        
        // Match visibility to toggle state
        const wireframeToggle = document.getElementById('toggle-mesh-lines-btn');
        wireframeMesh.visible = wireframeToggle.classList.contains('active');
        scene.add(wireframeMesh);
        
        // Update scene elements
        drawAxes(modelMaxDim * 1.2);
        setCameraView('3D'); // Resets camera position and zoom
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Draws X, Y, Z axes with labels.
 * @param {number} length - The length of the axis lines.
 */
function drawAxes(length) {
    const axes = {
        'x': { color: 0xff0000, dir: new THREE.Vector3(1, 0, 0) },
        'y': { color: 0x00ff00, dir: new THREE.Vector3(0, 1, 0) },
        'z': { color: 0x0000ff, dir: new THREE.Vector3(0, 0, 1) }
    };

    const coneRadius = length * 0.025;
    const coneHeight = length * 0.1;
    const textSize = length * 0.075;

    for (const axis in axes) {
        const { color, dir } = axes[axis];
        const hexColor = `#${color.toString(16).padStart(6, '0')}`;
        
        // Line
        const lineMat = new THREE.LineBasicMaterial({ color });
        const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(length)]);
        axesGroup.add(new THREE.Line(lineGeom, lineMat));

        // Cone
        const coneMat = new THREE.MeshBasicMaterial({ color });
        const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
        const cone = new THREE.Mesh(coneGeom, coneMat);
        cone.position.copy(dir.clone().multiplyScalar(length));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // Cones are Y-up by default
        axesGroup.add(cone);

        // Label
        const label = new SpriteText(axis.toUpperCase(), textSize, hexColor);
        label.fontWeight = 'bold';
        label.position.copy(dir.clone().multiplyScalar(length + coneHeight * 1.5));
        axesGroup.add(label);
    }
}

/**
 * Adjusts camera frustum to fit an object of a given size.
 * @param {number} size - The characteristic size of the object to fit.
 */
function updateCameraZoom(size) {
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    const padding = 1.2; // A little extra space around the model
    let frustumSize = size * padding;

    // Ensure a minimum size to avoid weirdness
    if (frustumSize < 10) frustumSize = 10;
    
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    
    camera.updateProjectionMatrix();
}

/**
 * Sets camera to a '3D' (perspective) or '2D' (top-down) view.
 * @param {'3D' | '2D'} viewType - The desired view type.
 */
function setCameraView(viewType) {
    const distanceFactor = 1.5;
    const cameraDistance = modelMaxDim * distanceFactor;

    if (viewType === '3D') {
        camera.position.set(cameraDistance, cameraDistance, cameraDistance);
        camera.up.set(0, 0, 1); // Z is up
        controls.enableRotate = true;
    } else if (viewType === '2D') {
        camera.position.set(0, 0, cameraDistance);
        camera.up.set(0, 1, 0); // Y is up for a top-down view from Z
        controls.enableRotate = false;
    }

    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    updateCameraZoom(modelMaxDim);
}

/**
 * Toggles visibility of the main solid mesh.
 * @param {boolean} visible 
 */
function toggleMeshVisibility(visible) {
    if (mainMesh) mainMesh.visible = visible;
}

/**
 * Toggles visibility of the wireframe overlay.
 * @param {boolean} visible 
 */
function toggleWireframeVisibility(visible) {
    if (wireframeMesh) wireframeMesh.visible = visible;
}

/**
 * Toggles visibility of the perimeter endpoint dots.
 * @param {boolean} visible 
 */
function toggleEndpointsVisibility(visible) {
    perimeterEndpoints.forEach(p => p.visible = visible);
}

/**
 * Activates or deactivates face selection mode.
 * @param {boolean} isActive 
 */
function toggleFaceSelectionMode(isActive) {
    selectionModeActive = isActive;
    document.getElementById('view-3d').style.cursor = isActive ? 'pointer' : 'default';
}

// --- CAM Visualization ---

function drawCAMSolutions(camData) {
    // Clear previous solutions
    if (camSolutionLines) {
        scene.remove(camSolutionLines);
        camSolutionLines.geometry.dispose();
        camSolutionLines.material.dispose();
    }

    const { modifiedTopPerimeter, modifiedBottomPerimeter, syncPairs } = camData;
    
    if (!modifiedTopPerimeter || !modifiedBottomPerimeter || !syncPairs || syncPairs.length === 0) return;

    const topPoly = modifiedTopPerimeter[0];
    const bottomPoly = modifiedBottomPerimeter[0];

    const points = [];
    syncPairs.forEach(pair => {
        const topPoint = topPoly[pair[0]];
        const bottomPoint = bottomPoly[pair[1]];
        if (topPoint && bottomPoint) {
            points.push(new THREE.Vector3(...topPoint));
            points.push(new THREE.Vector3(...bottomPoint));
        }
    });

    if (points.length === 0) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff }); // White
    camSolutionLines = new THREE.LineSegments(geometry, material);
    scene.add(camSolutionLines);
}

function toggleSolutionsVisibility(visible) {
    if (camSolutionLines) camSolutionLines.visible = visible;
}

function updateWireGuides(topPosition, bottomPosition) {
    if (topWireGuide && bottomWireGuide && wire) {
        if (topPosition && bottomPosition) {
            const topVec = new THREE.Vector3(topPosition.x, topPosition.y, topPosition.z);
            const bottomVec = new THREE.Vector3(bottomPosition.x, bottomPosition.y, bottomPosition.z);
            const coneHeight = 5; // Should match the cone geometry height

            // Position cones so their TIPS are at the target positions
            topWireGuide.position.copy(topVec).add(new THREE.Vector3(0, 0, coneHeight / 2));
            bottomWireGuide.position.copy(bottomVec).add(new THREE.Vector3(0, 0, -coneHeight / 2));
            topWireGuide.visible = true;
            bottomWireGuide.visible = true;

            // --- Correct Wire Positioning and Orientation ---
            const distance = topVec.distanceTo(bottomVec);
            const midpoint = new THREE.Vector3().addVectors(topVec, bottomVec).multiplyScalar(0.5);
            
            // Set position to the midpoint
            wire.position.copy(midpoint);
            
            // Scale the wire to the correct length
            wire.scale.set(1, distance, 1);
            
            // Orient the wire to align with the vector between the two points
            const direction = new THREE.Vector3().subVectors(topVec, bottomVec).normalize();
            wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            
            wire.visible = true;

        } else {
            topWireGuide.visible = false;
            bottomWireGuide.visible = false;
            wire.visible = false;
        }
    }
}


// --- Sensitive Perimeter and Selection Logic (Preserved from original) ---

/**
 * Handles clicks on the 3D view for face selection.
 * @param {MouseEvent} event 
 */
function onContainerClick(event) {
    if (!selectionModeActive || !mainMesh) return;

    // Raycasting setup
    const container = document.getElementById('view-3d');
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(mainMesh, false);
    if (intersects.length === 0) return;

    const { face } = intersects[0];
    if (!face) return;

    // Check if the selected face is flat and top-facing
    const selectedNormal = face.normal.clone().normalize();
    const up = new THREE.Vector3(0, 0, 1);

    if (selectedNormal.equals(up)) {
        // Clear previous perimeter lines
        if (topPerimeterLines) scene.remove(topPerimeterLines);
        if (bottomPerimeterLines) scene.remove(bottomPerimeterLines);
        if (middlePerimeterLines) scene.remove(middlePerimeterLines);
        if (lowerQuarterPerimeterLines) scene.remove(lowerQuarterPerimeterLines);
        if (upperQuarterPerimeterLines) scene.remove(upperQuarterPerimeterLines);
        perimeterEndpoints.forEach(p => scene.remove(p));
        perimeterEndpoints.length = 0;

        const geometry = mainMesh.geometry;
        const positions = geometry.attributes.position;
        const vA = new THREE.Vector3().fromBufferAttribute(positions, face.a);
        const topZ = vA.z;

        // 1. Extract and draw top perimeter (Pink)
        const topEdges = extractPerimeterEdges(mainMesh, topZ);
        topPerimeter = segmentsToPolyline(topEdges);
        topPerimeterLines = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(topEdges.flat()),
            new THREE.LineBasicMaterial({ color: 0xffc0cb }) // Pink
        );
        scene.add(topPerimeterLines);

        // 2. Find and extract bottom perimeter
        let bottomZ = null;
        const oppositeNormal = selectedNormal.clone().negate();
        for (let i = 0; i < positions.count; i += 3) {
            const normal = new THREE.Triangle(
                new THREE.Vector3().fromBufferAttribute(positions, i),
                new THREE.Vector3().fromBufferAttribute(positions, i + 1),
                new THREE.Vector3().fromBufferAttribute(positions, i + 2)
            ).getNormal(new THREE.Vector3());
            
            if (normal.equals(oppositeNormal)) {
                bottomZ = new THREE.Vector3().fromBufferAttribute(positions, i).z;
                break;
            }
        }

        if (bottomZ !== null) {
            // Bottom Perimeter (Cyan)
            const bottomEdges = extractPerimeterEdges(mainMesh, bottomZ);
            bottomPerimeter = segmentsToPolyline(bottomEdges);
            bottomPerimeterLines = new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(bottomEdges.flat()),
                new THREE.LineBasicMaterial({ color: 0x00ffff }) // Cyan
            );
            scene.add(bottomPerimeterLines);

            // Calculate and draw intermediate perimeters
            const sliceZs = {
                lowerQuarter: bottomZ + (topZ - bottomZ) * 0.25,
                middle: bottomZ + (topZ - bottomZ) * 0.50,
                upperQuarter: bottomZ + (topZ - bottomZ) * 0.75,
            };

            // Lower Quarter Perimeter (Blue)
            const lowerQuarterEdges = extractSegmentsAtZ(mainMesh, sliceZs.lowerQuarter);
            lowerQuarterPerimeter = segmentsToPolyline(lowerQuarterEdges);
            lowerQuarterPerimeterLines = new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(lowerQuarterEdges.flat()),
                new THREE.LineBasicMaterial({ color: 0x0000ff }) // Blue
            );
            scene.add(lowerQuarterPerimeterLines);
            
            // Middle Perimeter (Purple)
            const middleEdges = extractSegmentsAtZ(mainMesh, sliceZs.middle);
            middlePerimeter = segmentsToPolyline(middleEdges);
            middlePerimeterLines = new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(middleEdges.flat()),
                new THREE.LineBasicMaterial({ color: 0x800080 }) // Purple
            );
            scene.add(middlePerimeterLines);

            // Upper Quarter Perimeter (Red)
            const upperQuarterEdges = extractSegmentsAtZ(mainMesh, sliceZs.upperQuarter);
            upperQuarterPerimeter = segmentsToPolyline(upperQuarterEdges);
            upperQuarterPerimeterLines = new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(upperQuarterEdges.flat()),
                new THREE.LineBasicMaterial({ color: 0xff0000 }) // Red
            );
            scene.add(upperQuarterPerimeterLines);
        }

        // --- Helper to create colored points ---
        const createEndpointDots = (polylines, color) => {
            const points = polylines.flat().map(p => new THREE.Vector3(...p));
            if (points.length === 0) return;
            
            const pointsGeom = new THREE.BufferGeometry().setFromPoints(points);
            const pointsMat = new THREE.PointsMaterial({
                color: color,
                size: 3.0,
                sizeAttenuation: false
            });
            const dots = new THREE.Points(pointsGeom, pointsMat);
            perimeterEndpoints.push(dots);
            scene.add(dots);
        };

        // Draw endpoints for all perimeters with matching colors
        createEndpointDots(topPerimeter, 0xffc0cb); // Pink
        createEndpointDots(upperQuarterPerimeter, 0xff0000); // Red
        createEndpointDots(middlePerimeter, 0x800080); // Purple
        createEndpointDots(lowerQuarterPerimeter, 0x0000ff); // Blue
        createEndpointDots(bottomPerimeter, 0x00ffff); // Cyan
        
        // Deactivate selection mode and notify app
        toggleFaceSelectionMode(false);
        document.dispatchEvent(new CustomEvent('selectionCompleted'));
    }
}


// Exports
export { 
    init, 
    loadSTL, 
    toggleMeshVisibility, 
    toggleWireframeVisibility, 
    toggleEndpointsVisibility,
    toggleSolutionsVisibility,
    drawCAMSolutions,
    updateWireGuides,
    toggleFaceSelectionMode, 
    setCameraView,
    topPerimeter, 
    bottomPerimeter,
    lowerQuarterPerimeter,
    middlePerimeter,
    upperQuarterPerimeter,
}; 