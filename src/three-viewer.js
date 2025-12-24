// src/three-viewer.js

// Imports
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SpriteText from 'three-spritetext';
import { slice } from './slice.js';
import { getRulings, stitchRulings } from './rule.js';
import { kerf } from './kerf.js';

// Module-level variables
let scene, camera, renderer, controls, mainMesh, wireframeMesh, axesGroup;
let modelMaxDim = 10; // Default dimension for an empty scene
let selectionModeActive = false;
let currentPerimeters = null;
let orderedToolpath = null;
let vertexSelectionMode = { active: false, purpose: null };
let highlightOrb;
let highlightedVertex = null;
let leadInPoint = null;
let leadInOrb;
let manualRulings = [];
let manualRulingsGroup;
let firstManualRulingPoint = null;
let firstPointOrb;

// Visual aids for perimeters
let slicedPerimetersGroup;


// --- CAM Visualization ---
let camSolutionLines;
let rulingsGroup;
let stitchesGroup;
let kerfVizGroup;

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

    // Highlighter Orb
    const orbGeometry = new THREE.SphereGeometry(1, 16, 16);
    const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    highlightOrb = new THREE.Mesh(orbGeometry, orbMaterial);
    highlightOrb.visible = false;
    scene.add(highlightOrb);

    // Lead In Orb
    const leadInOrbMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 }); // dark green
    leadInOrb = new THREE.Mesh(orbGeometry, leadInOrbMaterial);
    leadInOrb.visible = false;
    scene.add(leadInOrb);

    // Orb for first point of manual ruling
    const firstPointMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    firstPointOrb = new THREE.Mesh(orbGeometry, firstPointMaterial);
    firstPointOrb.visible = false;
    scene.add(firstPointOrb);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    container.addEventListener('click', onContainerClick);
    container.addEventListener('mousemove', onMouseMove);
    
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
    if (slicedPerimetersGroup) scene.remove(slicedPerimetersGroup);
    if (rulingsGroup) scene.remove(rulingsGroup);
    if (stitchesGroup) scene.remove(stitchesGroup);
    if (manualRulingsGroup) scene.remove(manualRulingsGroup);
    if (kerfVizGroup) scene.remove(kerfVizGroup);
    if (leadInOrb) leadInOrb.visible = false;

    if (camSolutionLines) scene.remove(camSolutionLines);
    
    mainMesh = null;
    wireframeMesh = null;
    slicedPerimetersGroup = null;
    rulingsGroup = null;
    stitchesGroup = null;
    orderedToolpath = null;

    camSolutionLines = null;


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
        
        // Center the geometry on X and Y, and move its base to Z = 0
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -box.min.z);

        // Calculate model dimensions
        const boundingBoxSize = box.getSize(new THREE.Vector3());
        modelMaxDim = Math.max(boundingBoxSize.x, boundingBoxSize.y, boundingBoxSize.z);
        if (modelMaxDim === 0) modelMaxDim = 10; // Fallback for empty/flat models

        // Create main mesh
        const material = new THREE.MeshPhongMaterial({ color: 0xeee8d5, specular: 0x111111, shininess: 200 });
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
        
        recalculate();

        // Update scene elements
        drawAxes(modelMaxDim * 1.2);
        setCameraView('3D'); // Resets camera position and zoom
    };
    reader.readAsArrayBuffer(file);
}

function recalculate(offsets = {}) {
    if (!mainMesh) return;

    // Clear previous perimeters and rulings/stitches
    if (slicedPerimetersGroup) scene.remove(slicedPerimetersGroup);
    if (rulingsGroup) scene.remove(rulingsGroup);
    if (stitchesGroup) scene.remove(stitchesGroup);

    mainMesh.geometry.computeBoundingBox();
    const box = mainMesh.geometry.boundingBox;

    const bottomZ = box.min.z + (offsets.bottom || 0);
    const topZ = box.max.z - (offsets.top || 0); // Negative offset for top

    const perimeters = slice(mainMesh, bottomZ, topZ);
    currentPerimeters = perimeters;
    if (!perimeters) return;

    drawSlicedPerimeters(perimeters);
}

function prepareSurface() {
    if (!mainMesh || !currentPerimeters) {
        alert("Please load a model and calculate perimeters first.");
        return;
    }

    if (currentPerimeters.P0 && currentPerimeters.P1) {
        const P0 = currentPerimeters.P0[0];
        const P1 = currentPerimeters.P1[0];
        if (P0 && P1 && P0.length > 0 && P1.length > 0) {
            let rulings;
            if (manualRulings.length > 0) {
                // Use manually defined rulings
                rulings = manualRulings.map(r => [
                    [r[0].x, r[0].y, r[0].z],
                    [r[1].x, r[1].y, r[1].z]
                ]);
            } else {
                // Auto-calculate rulings
                const actualBottomZ = P0[0][2];
                const actualTopZ = P1[0][2];
                rulings = getRulings(mainMesh, actualBottomZ, actualTopZ);
            }
            
            orderedToolpath = stitchRulings(P0, P1, rulings, leadInPoint);
            drawRuledSurface(orderedToolpath);
        }
    }
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
 * Toggles visibility of the sliced perimeters.
 * @param {boolean} visible
 */
function togglePerimetersVisibility(visible) {
    if (slicedPerimetersGroup) slicedPerimetersGroup.visible = visible;
}

/**
 * Toggles visibility of the rulings.
 * @param {boolean} visible
 */
function toggleRulingsVisibility(visible) {
    if (rulingsGroup) rulingsGroup.visible = visible;
}

/**
 * Toggles visibility of the stitches.
 * @param {boolean} visible
 */
function toggleStitchesVisibility(visible) {
    if (stitchesGroup) stitchesGroup.visible = visible;
}

function toggleKerfsVisibility(visible) {
    if (kerfVizGroup) kerfVizGroup.visible = visible;
}

/**
 * Toggles visibility of the gadget.
 * @param {boolean} visible
 */
function toggleGadgetVisibility(visible) {
    if (axesGroup) axesGroup.visible = visible;
}

function deactivateAllModes() {
    selectionModeActive = false;
    vertexSelectionMode.active = false;
    vertexSelectionMode.purpose = null;
    if (highlightOrb) highlightOrb.visible = false;
    if (firstPointOrb) firstPointOrb.visible = false;
    highlightedVertex = null;
    firstManualRulingPoint = null;
    document.getElementById('view-3d').style.cursor = 'default';
}

function toggleFaceSelectionMode(isActive) {
    deactivateAllModes();
    if (isActive) {
        selectionModeActive = true;
        document.getElementById('view-3d').style.cursor = 'pointer';
    }
}

function toggleVertexSelectionMode(isActive, purpose) {
    deactivateAllModes();
    if (isActive) {
        if (purpose === 'manual-ruling') {
            manualRulings = [];
            if (manualRulingsGroup) manualRulingsGroup.visible = false;
        }
        vertexSelectionMode.active = true;
        vertexSelectionMode.purpose = purpose;
        document.getElementById('view-3d').style.cursor = 'crosshair';
    }
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

function drawRuledSurface(orderedPath) {
    if (rulingsGroup) scene.remove(rulingsGroup);
    if (stitchesGroup) scene.remove(stitchesGroup);
    if (!orderedPath || orderedPath.length === 0) return;

    const rulingPoints = [];
    const stitchPoints = [];

    for (let i = 0; i < orderedPath.length - 1; i++) {
        const current = orderedPath[i];
        const next = orderedPath[i+1];
        const isRuling = current[2];

        const p0_current = new THREE.Vector3(...current[0]);
        const p1_current = new THREE.Vector3(...current[1]);
        
        if (isRuling) {
            rulingPoints.push(p0_current, p1_current);
        } else {
            // Add the stitch from P1(i) to P0(i)
            stitchPoints.push(p1_current, p0_current);
            
            // Add the perimeter segments as stitches too
            const p1_next = new THREE.Vector3(...next[1]);
            stitchPoints.push(p1_current, p1_next);
            
            const p0_next = new THREE.Vector3(...next[0]);
            stitchPoints.push(p0_current, p0_next);
        }
    }

    // Draw rulings (green)
    if (rulingPoints.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(rulingPoints);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green
        rulingsGroup = new THREE.LineSegments(geometry, material);
        const rulingsToggle = document.getElementById('toggle-rulings-btn');
        rulingsGroup.visible = rulingsToggle.classList.contains('active');
        scene.add(rulingsGroup);
    }
    
    // Draw stitches (red)
    if (stitchPoints.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(stitchPoints);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Red
        stitchesGroup = new THREE.LineSegments(geometry, material);
        const stitchesToggle = document.getElementById('toggle-stitches-btn');
        stitchesGroup.visible = stitchesToggle.classList.contains('active');
        scene.add(stitchesGroup);
    }
}

function drawSlicedPerimeters(perimeters) {
    if (slicedPerimetersGroup) {
        scene.remove(slicedPerimetersGroup);
    }
    slicedPerimetersGroup = new THREE.Group();
    const perimetersToggle = document.getElementById('toggle-perimeters-btn');
    slicedPerimetersGroup.visible = perimetersToggle.classList.contains('active');

    const colors = {
        P0: 0x00ffff, // bright cyan
        P1: 0xffff00  // bright yellow
    };

    for (const key in perimeters) {
        const polylines = perimeters[key];
        const color = colors[key];
        if (polylines && color) {
            polylines.forEach(polyline => {
                const points = polyline.map(p => new THREE.Vector3(p[0], p[1], p[2]));
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ color: color });
                const line = new THREE.Line(geometry, material);
                slicedPerimetersGroup.add(line);
            });
        }
    }
    scene.add(slicedPerimetersGroup);
}

function drawKerfLines(kerfLines) {
    if (kerfSolutionLines) {
        scene.remove(kerfSolutionLines);
        kerfSolutionLines.geometry.dispose();
        kerfSolutionLines.material.dispose();
    }

    if (!kerfLines || kerfLines.length === 0) return;

    const points = [];
    kerfLines.forEach(line => {
        points.push(line.start);
        points.push(line.end);
    });

    if (points.length === 0) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green
    kerfSolutionLines = new THREE.LineSegments(geometry, material);
    scene.add(kerfSolutionLines);
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

function getPerimeterOfVertex(vertex) {
    const epsilon = 1e-5;
    if (currentPerimeters && currentPerimeters.P0 && currentPerimeters.P0[0]) {
        for (const p of currentPerimeters.P0[0]) {
            if (Math.abs(p[0] - vertex.x) < epsilon && Math.abs(p[1] - vertex.y) < epsilon && Math.abs(p[2] - vertex.z) < epsilon) {
                return 'P0';
            }
        }
    }
    if (currentPerimeters && currentPerimeters.P1 && currentPerimeters.P1[0]) {
        for (const p of currentPerimeters.P1[0]) {
            if (Math.abs(p[0] - vertex.x) < epsilon && Math.abs(p[1] - vertex.y) < epsilon && Math.abs(p[2] - vertex.z) < epsilon) {
                return 'P1';
            }
        }
    }
    return null;
}


function onMouseMove(event) {
    if (!vertexSelectionMode.active || !mainMesh) {
        if(highlightOrb.visible) highlightOrb.visible = false;
        return;
    }

    const container = document.getElementById('view-3d');
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    let closestVertex = null;

    if (vertexSelectionMode.purpose === 'manual-ruling') {
        if (!currentPerimeters || !currentPerimeters.P0 || !currentPerimeters.P1) {
            highlightOrb.visible = false;
            return;
        }

        let searchPerimeters = [];
        const firstPointPerimeter = firstManualRulingPoint ? getPerimeterOfVertex(firstManualRulingPoint) : null;

        if (firstPointPerimeter === 'P0') {
            searchPerimeters.push(...currentPerimeters.P1[0]);
        } else if (firstPointPerimeter === 'P1') {
            searchPerimeters.push(...currentPerimeters.P0[0]);
        } else {
            searchPerimeters.push(...currentPerimeters.P0[0], ...currentPerimeters.P1[0]);
        }

        let minDistanceSq = Infinity;
        const mouseVector = new THREE.Vector2(mouse.x * (rect.width / 2), mouse.y * (rect.height / 2));

        searchPerimeters.forEach(p => {
            const vertex = new THREE.Vector3(p[0], p[1], p[2]);
            const screenPos = vertex.clone().project(camera);
            const screenVector = new THREE.Vector2(screenPos.x * (rect.width / 2), screenPos.y * (rect.height / 2));
            const distanceSq = mouseVector.distanceToSquared(screenVector);
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestVertex = vertex;
            }
        });

        if (minDistanceSq > 400) { // 20px radius threshold
            closestVertex = null;
        }

    } else { // Original logic for other modes
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(mainMesh, false);
        if (intersects.length === 0) {
            highlightOrb.visible = false;
            highlightedVertex = null;
            return;
        }

        const intersect = intersects[0];
        const face = intersect.face;
        const positions = mainMesh.geometry.attributes.position;
        const vertices = [
            new THREE.Vector3().fromBufferAttribute(positions, face.a),
            new THREE.Vector3().fromBufferAttribute(positions, face.b),
            new THREE.Vector3().fromBufferAttribute(positions, face.c)
        ];

        let minDistanceSq = Infinity;
        vertices.forEach(vertex => {
            const distanceSq = intersect.point.distanceToSquared(vertex);
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestVertex = vertex;
            }
        });
    }

    if (closestVertex) {
        highlightedVertex = closestVertex.clone();
        highlightOrb.position.copy(highlightedVertex);
        highlightOrb.scale.setScalar(modelMaxDim * 0.01);
        highlightOrb.visible = true;
    } else {
        highlightOrb.visible = false;
        highlightedVertex = null;
    }
}

/**
 * Handles clicks on the 3D view for face selection.
 * @param {MouseEvent} event 
 */
function onContainerClick(event) {
    if (vertexSelectionMode.active && highlightedVertex) {
        let modeShouldEnd = true;

        if (vertexSelectionMode.purpose === 'origin') {
            const selectedVertex = highlightedVertex.clone();
            mainMesh.geometry.translate(-selectedVertex.x, -selectedVertex.y, 0);
            wireframeMesh.geometry.translate(-selectedVertex.x, -selectedVertex.y, 0);
            mainMesh.geometry.computeBoundingBox();
            const box = mainMesh.geometry.boundingBox;
            mainMesh.geometry.translate(0, 0, -box.min.z);
            wireframeMesh.geometry.translate(0, 0, -box.min.z);
            recalculate();

        } else if (vertexSelectionMode.purpose === 'lead-in') {
            const selectedVertex = highlightedVertex.clone();
            leadInOrb.position.copy(selectedVertex);
            leadInOrb.scale.setScalar(modelMaxDim * 0.01);
            leadInOrb.visible = true;
            leadInPoint = [selectedVertex.x, selectedVertex.y, selectedVertex.z];

        } else if (vertexSelectionMode.purpose === 'manual-ruling') {
            if (!firstManualRulingPoint) {
                firstManualRulingPoint = highlightedVertex.clone();
                firstPointOrb.position.copy(firstManualRulingPoint);
                firstPointOrb.scale.setScalar(modelMaxDim * 0.01);
                firstPointOrb.visible = true;
            } else {
                const secondPoint = highlightedVertex.clone();
                manualRulings.push([firstManualRulingPoint, secondPoint]);
                
                firstManualRulingPoint = null;
                firstPointOrb.visible = false;
                drawManualRulings();
            }
            modeShouldEnd = false; // Keep the mode active
        }
        
        if (modeShouldEnd) {
            deactivateAllModes();
            document.dispatchEvent(new CustomEvent('selectionCompleted'));
        }
        return;
    }
    
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

    // 1. Get the normal of the clicked face in world space.
    const worldNormal = face.normal.clone().applyQuaternion(mainMesh.quaternion).normalize();

    // 2. Define the target normal (Z-up).
    const targetNormal = new THREE.Vector3(0, 0, 1);

    // 3. Calculate the rotation needed to align the face normal with the target normal.
    const quaternion = new THREE.Quaternion().setFromUnitVectors(worldNormal, targetNormal);

    // 4. Apply this rotation to the geometries.
    mainMesh.geometry.applyQuaternion(quaternion);
    wireframeMesh.geometry.applyQuaternion(quaternion);

    // 5. After rotation, re-center the geometry so its base is at Z=0.
    mainMesh.geometry.computeBoundingBox();
    const box = mainMesh.geometry.boundingBox;
    mainMesh.geometry.translate(0, 0, -box.min.z);
    wireframeMesh.geometry.translate(0, 0, -box.min.z);

    // 6. Re-slice the model and draw the new perimeters.
    recalculate();

    // 7. Deactivate selection mode and notify the app.
    deactivateAllModes();
    document.dispatchEvent(new CustomEvent('selectionCompleted'));
}

function drawManualRulings() {
    if (manualRulingsGroup) scene.remove(manualRulingsGroup);
    if (manualRulings.length === 0) return;

    const points = [];
    manualRulings.forEach(segment => {
        points.push(segment[0]);
        points.push(segment[1]);
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green
    manualRulingsGroup = new THREE.LineSegments(geometry, material);
    scene.add(manualRulingsGroup);
}

function calculateAndDrawKerf() {
    if (!orderedToolpath || orderedToolpath.length < 3) {
        alert("Please prepare the surface first to generate a toolpath.");
        return;
    }

    if (kerfVizGroup) scene.remove(kerfVizGroup);
    kerfVizGroup = new THREE.Group();

    const wireDiameter = parseFloat(document.getElementById('wire-diameter').value);
    const bottomGuideOffset = parseFloat(document.getElementById('bottom-guide-z-offset').value);
    const topGuidePosition = parseFloat(document.getElementById('top-guide-z-position').value);
    
    const kerf_radius = wireDiameter / 2;
    const Z0 = 0 - bottomGuideOffset; 
    const Z1 = topGuidePosition;

    const sphereGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // White spheres
    
    for (let i = 0; i < orderedToolpath.length - 1; i++) {
        const n = orderedToolpath.length - 1;
        const prev = orderedToolpath[(i - 1 + n) % n];
        const curr = orderedToolpath[i];
        const next = orderedToolpath[(i + 1) % n];

        const points = {
            A: new THREE.Vector3(...curr[1]),
            B: new THREE.Vector3(...prev[1]),
            C: new THREE.Vector3(...next[1]),
            D: new THREE.Vector3(...curr[0]),
            E: new THREE.Vector3(...prev[0]),
            F: new THREE.Vector3(...next[0])
        };

        const result = kerf(points, kerf_radius, Z0, Z1);

        for (const key in result) {
            const point = result[key];
            if (point) {
                const sphere = new THREE.Mesh(sphereGeom, sphereMat);
                sphere.position.copy(point);
                kerfVizGroup.add(sphere);
            }
        }
    }

    const kerfsToggle = document.getElementById('toggle-kerfs-btn');
    kerfVizGroup.visible = kerfsToggle.classList.contains('active');
    scene.add(kerfVizGroup);
}



// Exports
export { 
    init, 
    loadSTL,
    recalculate,
    prepareSurface,
    deactivateAllModes,
    calculateAndDrawKerf,
    toggleMeshVisibility, 
    toggleWireframeVisibility, 
    togglePerimetersVisibility,
    toggleRulingsVisibility,
    toggleStitchesVisibility,
    toggleKerfsVisibility,
    toggleGadgetVisibility,
    toggleFaceSelectionMode, 
    toggleVertexSelectionMode,
    drawCAMSolutions,
    drawRuledSurface,
    drawKerfLines,
    updateWireGuides,
    setCameraView,
    currentPerimeters,
};
