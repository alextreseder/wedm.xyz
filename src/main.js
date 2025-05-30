import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
// import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'; // No longer needed
// import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'; // No longer needed

const view3DContainer = document.getElementById('view-3d');
const view2D = document.getElementById('view-2d');
const gcodeEditor = document.getElementById('gcode-editor');

const mode3DBtn = document.getElementById('mode-3d-btn');
const mode2DBtn = document.getElementById('mode-2d-btn');
const modeGCodeBtn = document.getElementById('mode-gcode-btn');
const loadStlBtn = document.getElementById('load-stl-btn');
const loadGearBtn = document.getElementById('load-gear-btn');
const loadLoftBtn = document.getElementById('load-loft-btn');
const selectTopFaceBtn = document.getElementById('select-top-face-btn');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.stl';

const viewTitle = document.getElementById('view-title');

const allViews = [view3DContainer, view2D, gcodeEditor];
const allModeBtns = [mode3DBtn, mode2DBtn, modeGCodeBtn];

let scene, camera, renderer, controls, stlLoader; // fontLoader removed
let currentObject = null;
let originalMaterial = null; // To store original material for reset
let axesGroup = new THREE.Group();
let perimeterVizGroup; // New group for perimeter visualization

let selectionModeActive = false; // New state for selection mode
const raycaster = new THREE.Raycaster(); // For face selection
const mouse = new THREE.Vector2(); // For raycaster

// Colors for faces
const TOP_FACE_COLOR = new THREE.Color(0xCBC3E3); // Light Purple
const BOTTOM_FACE_COLOR = new THREE.Color(0xAFEEEE); // Light Cyan / PaleTurquoise
const WALL_FACE_COLOR = new THREE.Color(0xFFDAB9); // Light Orange / PeachPuff

function init3DView() {
    if (!view3DContainer || view3DContainer.dataset.initialized) return;

    scene = new THREE.Scene();
    const cssVariables = getComputedStyle(document.documentElement);
    const bgColor = cssVariables.getPropertyValue('--theme-bg-dark').trim();
    scene.background = new THREE.Color(bgColor || '#242526');

    const width = view3DContainer.clientWidth;
    const height = view3DContainer.clientHeight;

    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    view3DContainer.innerHTML = '';
    view3DContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 15);
    scene.add(directionalLight);

    stlLoader = new STLLoader();
    // fontLoader = new FontLoader(); // Removed

    // Create initial axes (font parameter removed)
    createAxes(10);
    scene.add(axesGroup);

    view3DContainer.addEventListener('click', onMouseClickForSelection, false);

    animate();
    view3DContainer.dataset.initialized = 'true';
}

function createAxes(size) { // font parameter removed
    axesGroup.clear();

    const origin = new THREE.Vector3(0, 0, 0);
    const lineMaterialX = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const lineMaterialY = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const lineMaterialZ = new THREE.LineBasicMaterial({ color: 0x0000ff });
    const pointsX = [origin, new THREE.Vector3(size, 0, 0)];
    const pointsY = [origin, new THREE.Vector3(0, size, 0)];
    const pointsZ = [origin, new THREE.Vector3(0, 0, size)];
    const geometryX = new THREE.BufferGeometry().setFromPoints(pointsX);
    const geometryY = new THREE.BufferGeometry().setFromPoints(pointsY);
    const geometryZ = new THREE.BufferGeometry().setFromPoints(pointsZ);
    const lineX = new THREE.Line(geometryX, lineMaterialX);
    const lineY = new THREE.Line(geometryY, lineMaterialY);
    const lineZ = new THREE.Line(geometryZ, lineMaterialZ);
    axesGroup.add(lineX, lineY, lineZ);

    const headLength = size * 0.1;
    const headWidth = size * 0.05;
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), origin, size, 0xff0000, headLength, headWidth);
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), origin, size, 0x00ff00, headLength, headWidth);
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), origin, size, 0x0000ff, headLength, headWidth);
    axesGroup.add(arrowX, arrowY, arrowZ);

    const spriteScale = size * 0.1;
    const labelX = createAxisLabelSprite('X', '#ff0000', spriteScale * 1.5 );
    labelX.position.set(size * 1.1, 0, 0);
    axesGroup.add(labelX);
    const labelY = createAxisLabelSprite('Y', '#00ff00', spriteScale * 1.5);
    labelY.position.set(0, size * 1.1, 0);
    axesGroup.add(labelY);
    const labelZ = createAxisLabelSprite('Z', '#0000ff', spriteScale * 1.5);
    labelZ.position.set(0, 0, size * 1.1);
    axesGroup.add(labelZ);
}

function createAxisLabelSprite(text, color, spriteSize) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 64; // High resolution for clarity, will be scaled down by sprite
    context.font = `Bold ${fontSize}px Arial`;
    
    // Measure text to size canvas appropriately
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    canvas.width = textWidth + fontSize * 0.2; // Add some padding
    canvas.height = fontSize * 1.2; // Adjust for height and padding

    // Re-apply font after canvas resize (important for some browsers)
    context.font = `Bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    
    // Scale the sprite
    // The spriteSize is an indicative world unit size. We scale based on canvas aspect ratio.
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(spriteSize * aspect, spriteSize, 1);

    return sprite;
}

// Helper function to process loaded STL geometry
function _setupNewModel(geometry) {
    if (currentObject) {
        resetObjectMaterial(currentObject); // Resets material, clears colors, and clears perimeter viz
        scene.remove(currentObject);
        if (currentObject.geometry) currentObject.geometry.dispose(); // Dispose old geometry
    }

    geometry.center(); // Center the geometry

    // Store the original material details for reset
    originalMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc, // Light grey
        shininess: 50,
        specular: 0x111111
    });

    // Create the main mesh with a clone of the original material
    currentObject = new THREE.Mesh(geometry, originalMaterial.clone());
    scene.add(currentObject);

    // Add wireframe
    const wireframeGeo = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 0.5, transparent: true, opacity: 0.25 });
    const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
    currentObject.add(wireframe);

    // Adjust camera and axes to fit the new object
    const boundingBox = new THREE.Box3().setFromObject(currentObject);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const sizeVec = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);

    controls.target.copy(center);
    // camera.position.copy(center).add(new THREE.Vector3(maxDim * 0.75, maxDim * 0.75, maxDim * 1.5)); // Preserve current view angle somewhat
    const offsetDistance = maxDim * 2; // Ensure camera is far enough
    const newCamPos = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(offsetDistance).add(center);
    camera.position.copy(newCamPos);
    camera.lookAt(center);
    controls.update();

    createAxes(maxDim * 0.75); // Scale axes based on object size
}

function loadSTLFromFilePath(filePath) {
    if (!stlLoader || !scene) {
        console.error("STL Loader or scene not initialized.");
        return;
    }
    stlLoader.load(filePath,
        (geometry) => { // onLoad
            _setupNewModel(geometry);
        },
        undefined, // onProgress (optional)
        (error) => { // onError
            console.error('Error loading STL from path:', filePath, error);
            alert(`Error loading STL file: ${filePath}`);
        }
    );
}

function loadSTL(file) {
    if (!stlLoader) {
        console.error("STL Loader not initialized.");
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const geometry = stlLoader.parse(event.target.result);
            _setupNewModel(geometry);
        } catch (error) {
            console.error('Error parsing STL from file:', file.name, error);
            alert('Error loading or parsing STL file.');
        }
    };
    reader.onerror = (error) => {
        console.error('FileReader error for STL:', file.name, error);
        alert('Error reading STL file.');
    };
    reader.readAsArrayBuffer(file);
}

function handleFileDrop(event) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith('.stl')) {
            loadSTL(file);
        }
    }
}

function handleFileSelect(event) {
    if (event.target.files.length > 0) {
        const file = event.target.files[0];
        if (file.name.toLowerCase().endsWith('.stl')) {
            loadSTL(file);
        }
    }
}

if (view3DContainer) {
    view3DContainer.addEventListener('dragover', (event) => event.preventDefault());
    view3DContainer.addEventListener('drop', handleFileDrop);
}

if (loadStlBtn) {
    loadStlBtn.addEventListener('click', () => fileInput.click());
}
if (loadGearBtn) {
    loadGearBtn.addEventListener('click', () => loadSTLFromFilePath('gear.stl'));
}
if (loadLoftBtn) {
    loadLoftBtn.addEventListener('click', () => loadSTLFromFilePath('loft.stl'));
}
fileInput.addEventListener('change', handleFileSelect);

function animate() {
    if (!renderer || !scene || !camera) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    if (camera && renderer && view3DContainer) {
        const width = view3DContainer.clientWidth;
        const height = view3DContainer.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}
window.addEventListener('resize', onWindowResize);

function setActiveView(viewToShow, btnToActivate, title) {
    allViews.forEach(view => {
        if (view) view.style.display = 'none';
    });
    allModeBtns.forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    if (viewToShow) {
        viewToShow.style.display = 'block';
        if (viewToShow.id === 'view-3d') {
            // Removed redundant placeholder check, init3DView handles clearing if needed.
            init3DView();
            onWindowResize();
        }
    }
    if (btnToActivate) btnToActivate.classList.add('active');
    if (viewTitle && title) viewTitle.textContent = title;
}

if (mode3DBtn) {
    mode3DBtn.addEventListener('click', () => setActiveView(view3DContainer, mode3DBtn, '3D View'));
}
if (mode2DBtn) {
    mode2DBtn.addEventListener('click', () => setActiveView(view2D, mode2DBtn, '2D View'));
}
if (modeGCodeBtn) {
    modeGCodeBtn.addEventListener('click', () => setActiveView(gcodeEditor, modeGCodeBtn, 'G-Code Editor'));
}

// Set initial view
setActiveView(view3DContainer, mode3DBtn, '3D View');

// Remove the old "Hello Vite!" message
// document.querySelector('#app').innerHTML = `
//   <h1>Hello Vite!</h1>
//   <a href="https://vitejs.dev/guide/features.html" target="_blank">Documentation</a>
// `;

// New function to handle face selection clicks
function onMouseClickForSelection(event) {
    if (!selectionModeActive || !currentObject || !camera || !renderer) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(currentObject, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.object === currentObject && intersect.face && intersect.object.geometry) {
            // console.log('Clicked face index on original geometry:', intersect.face.a, intersect.face.b, intersect.face.c);
            // console.log('Face normal (local to object):' , intersect.face.normal);
            identifyAndColorFaces(intersect.object, intersect.face);
        } else {
            console.warn('Intersection is not the main object or lacks face/geometry.', intersect);
        }
    } else {
        // console.log('No intersection with object.');
    }
}

function identifyAndColorFaces(object, clickedFaceFromRaycaster) {
    let originalGeometry = object.geometry;
    let activeGeometry = object.geometry;
    if (!activeGeometry.isBufferGeometry) { console.error('Geometry is not BufferGeometry.'); return; }
    
    let nonIndexedGeometry = activeGeometry.index ? activeGeometry.toNonIndexed() : activeGeometry;
    if (!nonIndexedGeometry.attributes.normal || !nonIndexedGeometry.attributes.position) { console.error('Non-indexed geometry is missing normals or positions!'); return; }
    
    const numVertices = nonIndexedGeometry.attributes.position.count;
    if (!nonIndexedGeometry.attributes.color || nonIndexedGeometry.attributes.color.count !== numVertices) {
        nonIndexedGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(numVertices * 3), 3));
    } else {
        const colorsArray = nonIndexedGeometry.attributes.color.array;
        for(let i = 0; i < colorsArray.length; i++) { colorsArray[i] = 0; } // Reset all to 0
        nonIndexedGeometry.attributes.color.needsUpdate = true;
    }
    const colorsAttribute = nonIndexedGeometry.attributes.color;
    
    const worldClickedNormal = new THREE.Vector3().copy(clickedFaceFromRaycaster.normal).applyMatrix3(object.normalMatrix).normalize();
    
    const vA_orig_world = new THREE.Vector3().fromBufferAttribute(originalGeometry.attributes.position, clickedFaceFromRaycaster.a).applyMatrix4(object.matrixWorld);
    const vB_orig_world = new THREE.Vector3().fromBufferAttribute(originalGeometry.attributes.position, clickedFaceFromRaycaster.b).applyMatrix4(object.matrixWorld);
    const vC_orig_world = new THREE.Vector3().fromBufferAttribute(originalGeometry.attributes.position, clickedFaceFromRaycaster.c).applyMatrix4(object.matrixWorld);
    const clickedFaceVerticesWorldZ = [vA_orig_world.z, vB_orig_world.z, vC_orig_world.z];

    // console.log("Clicked Face Normal (World):", worldClickedNormal);
    // console.log("Clicked Face Vertices Z (World from original geom):", clickedFaceVerticesWorldZ);
    
    let topFaceVertexIndices = [];
    let bottomFaceVertexIndices = [];
    let bottomFaceWorldZCoords = []; 

    const boundingBoxForIteration = new THREE.Box3().setFromObject(object); // Use non-indexed for consistency if positions are same
    const minWorldZForIteration = boundingBoxForIteration.min.z;
    const posAttr = nonIndexedGeometry.attributes.position;
    const normalAttr = nonIndexedGeometry.attributes.normal; // Should be available due to check above

    for (let i = 0; i < numVertices; i += 3) {
        // For non-indexed, face normal can be derived from first vertex's normal if flat shaded,
        // or recomputed. Assuming STLs might not have perfect vertex normals for this.
        // Recomputing face normal from non-indexed positions:
        const p1_local_face = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        const p2_local_face = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
        const p3_local_face = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);
        const currentFaceLocalNormal = new THREE.Vector3().subVectors(p3_local_face, p2_local_face).cross(new THREE.Vector3().subVectors(p1_local_face, p2_local_face)).normalize();
        const currentWorldNormal = currentFaceLocalNormal.clone().applyMatrix3(object.normalMatrix).normalize();

        const currentV1World = p1_local_face.clone().applyMatrix4(object.matrixWorld);
        const currentV2World = p2_local_face.clone().applyMatrix4(object.matrixWorld);
        const currentV3World = p3_local_face.clone().applyMatrix4(object.matrixWorld);
        const currentFaceVerticesWorldZ = [currentV1World.z, currentV2World.z, currentV3World.z];

        if (currentWorldNormal.distanceTo(worldClickedNormal) < 0.01) { // Tolerance for normal match
            let sharesZ = clickedFaceVerticesWorldZ.some(zC => currentFaceVerticesWorldZ.some(zCurr => Math.abs(zC - zCurr) < 0.001));
            if (sharesZ) topFaceVertexIndices.push(i, i + 1, i + 2);
        }
        const oppositeWorldClickedNormal = worldClickedNormal.clone().negate(); // Calculate once per call
        if (currentWorldNormal.distanceTo(oppositeWorldClickedNormal) < 0.01) {
             if (currentFaceVerticesWorldZ.some(z => Math.abs(z - minWorldZForIteration) < 0.015)) { // Z tolerance for bottom
                bottomFaceVertexIndices.push(i, i + 1, i + 2);
                bottomFaceWorldZCoords.push(currentV1World.z, currentV2World.z, currentV3World.z);
             }
        }
    }
    // console.log("Top faces identified:", topFaceVertexIndices.length / 3);
    // console.log("Bottom faces identified:", bottomFaceVertexIndices.length / 3);

    for (let i = 0; i < numVertices; i++) { colorsAttribute.setXYZ(i, WALL_FACE_COLOR.r, WALL_FACE_COLOR.g, WALL_FACE_COLOR.b); }
    topFaceVertexIndices.forEach(idx => { colorsAttribute.setXYZ(idx, TOP_FACE_COLOR.r, TOP_FACE_COLOR.g, TOP_FACE_COLOR.b); });
    bottomFaceVertexIndices.forEach(idx => { colorsAttribute.setXYZ(idx, BOTTOM_FACE_COLOR.r, BOTTOM_FACE_COLOR.g, BOTTOM_FACE_COLOR.b); });
    colorsAttribute.needsUpdate = true;
    
    if (object.geometry !== nonIndexedGeometry) { 
        // console.log("Replacing indexed geometry with non-indexed for coloring.");
        object.geometry.dispose(); 
        object.geometry = nonIndexedGeometry; 
    }
    
    // Material is already cloned in _setupNewModel, ensure originalMaterial is reference
    if (!originalMaterial) { // Should be set by _setupNewModel, but as a fallback:
        console.warn("originalMaterial not found, creating a default one for vertex coloring.")
        originalMaterial = object.material.clone(); // This might be the vertexColor material if error
    }

    object.material = new THREE.MeshPhongMaterial({ 
        vertexColors: true, 
        shininess: originalMaterial.shininess !== undefined ? originalMaterial.shininess : 50,
        specular: originalMaterial.specular ? (originalMaterial.specular.isColor ? originalMaterial.specular.getHex() : 0x111111) : 0x111111,
        // side: THREE.DoubleSide // Consider if needed for problematic STLs
    });

    if (perimeterVizGroup) {
        perimeterVizGroup.children.forEach(child => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
        if(perimeterVizGroup.parent) perimeterVizGroup.parent.remove(perimeterVizGroup);
        perimeterVizGroup.clear();
    } else {
        perimeterVizGroup = new THREE.Group();
        scene.add(perimeterVizGroup);
    }

    const referenceTopZ = clickedFaceVerticesWorldZ.reduce((acc, z) => acc + z, 0) / clickedFaceVerticesWorldZ.length;
    processAndVisualizePerimeter(object, nonIndexedGeometry, colorsAttribute, referenceTopZ, 'top', 0xffff00); // Yellow

    let referenceBottomZ = NaN;
    if (bottomFaceWorldZCoords.length > 0) {
        referenceBottomZ = bottomFaceWorldZCoords.reduce((acc, z) => acc + z, 0) / bottomFaceWorldZCoords.length;
        processAndVisualizePerimeter(object, nonIndexedGeometry, colorsAttribute, referenceBottomZ, 'bottom', 0xadd8e6); // Light Blue
    } else {
        console.log("No bottom face vertices identified for bottom perimeter.");
    }

    // --- Mid-Plane Perimeter Logic ---
    const EPSILON_Z_FOR_MIDPLANE_CHECK = 0.001; // Small tolerance
    if (!isNaN(referenceTopZ) && !isNaN(referenceBottomZ) && bottomFaceWorldZCoords.length > 0 && topFaceVertexIndices.length > 0) {
        if (Math.abs(referenceTopZ - referenceBottomZ) > EPSILON_Z_FOR_MIDPLANE_CHECK * 2) { // Ensure there's some thickness
             const midPlaneZ = (referenceTopZ + referenceBottomZ) / 2.0;
             console.log("Calculated MidPlane Z for perimeter:", midPlaneZ);
             processAndVisualizeMidPlanePerimeter(object, nonIndexedGeometry, colorsAttribute, midPlaneZ, 0x00ff00); // Green
        } else {
            console.log("Top and Bottom faces are co-planar or very close, skipping mid-plane perimeter.");
        }
    } else {
        console.log("Not enough data for mid-plane perimeter (missing top or bottom faces/reference Z).");
    }
    // --- End Mid-Plane Perimeter Logic ---

    console.log("Face identification, coloring, and perimeters processed.");
    deactivateFaceSelectionMode();
}

function getWallFaceTriangles(geometry, colorsAttribute) {
    const wallFaceTriangles = []; // Stores {v1: Vector3, v2: Vector3, v3: Vector3} in local coords
    const numVertices = geometry.attributes.position.count;
    const posAttr = geometry.attributes.position;

    for (let i = 0; i < numVertices; i += 3) {
        const v1Idx = i;
        // Check color of the first vertex of the face
        if (Math.abs(colorsAttribute.getX(v1Idx) - WALL_FACE_COLOR.r) < 0.001 &&
            Math.abs(colorsAttribute.getY(v1Idx) - WALL_FACE_COLOR.g) < 0.001 &&
            Math.abs(colorsAttribute.getZ(v1Idx) - WALL_FACE_COLOR.b) < 0.001) {
            wallFaceTriangles.push({
                v1: new THREE.Vector3().fromBufferAttribute(posAttr, v1Idx),
                v2: new THREE.Vector3().fromBufferAttribute(posAttr, v1Idx + 1),
                v3: new THREE.Vector3().fromBufferAttribute(posAttr, v1Idx + 2),
            });
        }
    }
    return wallFaceTriangles;
}

function processAndVisualizePerimeter(object, geometry, colorsAttribute, referenceZ, perimeterType, tubeColor) {
    // console.log(`Starting ${perimeterType} perimeter detection... Reference Z: ${referenceZ}`);
    // const numVertices = geometry.attributes.position.count; // Not directly used, wallFaceTriangles is primary
    const wallFaceTriangles = getWallFaceTriangles(geometry, colorsAttribute); // Use helper

    // console.log(`Identified ${wallFaceTriangles.length} wall faces for ${perimeterType} perimeter check.`);

    const perimeterEdgesLocal = [];
    const zTolerance = 0.015; 
    const epsilonSq = 0.0001 * 0.0001; // For local vertex equality

    wallFaceTriangles.forEach(face => {
        const vertices = [face.v1, face.v2, face.v3]; // Local coordinates
        let refZVerticesData = []; // Stores { localVertex: Vector3 }

        vertices.forEach(localVertex => {
            const worldVertexZ = localVertex.clone().applyMatrix4(object.matrixWorld).z;
            if (Math.abs(worldVertexZ - referenceZ) < zTolerance) { 
                refZVerticesData.push({ localVertex });
            }
        });

        if (refZVerticesData.length === 2) {
            const p1Local = refZVerticesData[0].localVertex;
            const p2Local = refZVerticesData[1].localVertex;
            
            let exists = perimeterEdgesLocal.some(edge =>
                (edge.start.distanceToSquared(p1Local) < epsilonSq && edge.end.distanceToSquared(p2Local) < epsilonSq) ||
                (edge.start.distanceToSquared(p2Local) < epsilonSq && edge.end.distanceToSquared(p1Local) < epsilonSq)
            );
            if (!exists) {
                perimeterEdgesLocal.push({ start: p1Local, end: p2Local });
            }
        }
    });
    // console.log(`${perimeterType} perimeter edges (local coords) found: ${perimeterEdgesLocal.length}`);

    if (perimeterEdgesLocal.length === 0) {
        // console.log(`No ${perimeterType} perimeter edges identified to visualize.`);
        return;
    }

    const orderedWorldVertices = [];
    const availableEdges = [...perimeterEdgesLocal]; 
    const stitchToleranceSq = 0.001 * 0.001;

    if (availableEdges.length > 0) {
        let currentEdge = availableEdges.shift();
        orderedWorldVertices.push(currentEdge.start.clone().applyMatrix4(object.matrixWorld));
        orderedWorldVertices.push(currentEdge.end.clone().applyMatrix4(object.matrixWorld));
        
        let attempts = 0;
        const maxAttempts = perimeterEdgesLocal.length + 5; 
        while (availableEdges.length > 0 && attempts < maxAttempts) {
            let lastVertexWorld = orderedWorldVertices[orderedWorldVertices.length - 1];
            let foundNext = false;
            for (let i = 0; i < availableEdges.length; i++) {
                let nextEdgeLocal = availableEdges[i];
                let nextStartWorld = nextEdgeLocal.start.clone().applyMatrix4(object.matrixWorld);
                let nextEndWorld = nextEdgeLocal.end.clone().applyMatrix4(object.matrixWorld);
                if (lastVertexWorld.distanceToSquared(nextStartWorld) < stitchToleranceSq) {
                    orderedWorldVertices.push(nextEndWorld); availableEdges.splice(i, 1); foundNext = true; break;
                } else if (lastVertexWorld.distanceToSquared(nextEndWorld) < stitchToleranceSq) {
                    orderedWorldVertices.push(nextStartWorld); availableEdges.splice(i, 1); foundNext = true; break;
                }
            }
            if (!foundNext) { 
                // console.warn(`${perimeterType} perimeter stitch incomplete. Remaining edges: ${availableEdges.length}`); 
                break; 
            }
            attempts++;
        }
        // if (attempts >= maxAttempts && availableEdges.length > 0) { /* console.warn(...) */ }
    }
    // console.log(`Ordered world vertices for ${perimeterType} perimeter path: ${orderedWorldVertices.length}`);

    if (orderedWorldVertices.length < 2) {
        // console.log(`Not enough ordered vertices for ${perimeterType} perimeter tube.`);
        return;
    }

    const curvePath = new THREE.CurvePath();
    for (let i = 0; i < orderedWorldVertices.length - 1; i++) {
        curvePath.add(new THREE.LineCurve3(orderedWorldVertices[i], orderedWorldVertices[i + 1]));
    }

    if (curvePath.curves.length > 0) {
        const boundingBox = new THREE.Box3().setFromObject(object);
        const sizeVec = boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        const pipeRadius = Math.max(0.01, maxDim * 0.0075); 

        const tubeGeometry = new THREE.TubeGeometry(curvePath, Math.max(2, orderedWorldVertices.length * 2), pipeRadius, 8, false);
        const tubeMaterial = new THREE.MeshPhongMaterial({ color: tubeColor, emissive: new THREE.Color(tubeColor).multiplyScalar(0.2), side: THREE.DoubleSide });
        const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
        perimeterVizGroup.add(tubeMesh); // perimeterVizGroup is global and added to scene
        // console.log(`${perimeterType} perimeter tube created and added to scene.`);
    }
}

function processAndVisualizeMidPlanePerimeter(object, geometry, colorsAttribute, midPlaneZ, tubeColor) {
    console.log(`Starting mid-plane perimeter detection... Mid-Plane Z: ${midPlaneZ}`);
    const wallFaceTriangles = getWallFaceTriangles(geometry, colorsAttribute);
    const midPlaneIntersectionEdgesWorld = [];
    const EPSILON_Z_PLANE = 0.001; // For checking if vertex is on plane
    const EPSILON_SQUARED = EPSILON_Z_PLANE * EPSILON_Z_PLANE; // For point equality checks

    // Helper to add edge if unique (world coordinates)
    function addEdgeIfUnique(p_start, p_end, edgeList) {
        let exists = edgeList.some(edge =>
            (edge.start.distanceToSquared(p_start) < EPSILON_SQUARED && edge.end.distanceToSquared(p_end) < EPSILON_SQUARED) ||
            (edge.start.distanceToSquared(p_end) < EPSILON_SQUARED && edge.end.distanceToSquared(p_start) < EPSILON_SQUARED)
        );
        if (!exists) {
            edgeList.push({ start: p_start, end: p_end });
        }
    }
    
    // Helper to find intersection of an edge (p1w, p2w in world) with planeZ
    function getIntersectionPointWorld(p1w, p2w, planeZ) {
        const d1 = p1w.z - planeZ;
        const d2 = p2w.z - planeZ;

        // If edge is (nearly) on the plane, or both points on same side (and not on plane), no crossing.
        if ((Math.abs(d1) < EPSILON_Z_PLANE && Math.abs(d2) < EPSILON_Z_PLANE)) return null; 
        if (d1 * d2 > EPSILON_SQUARED) return null; // strictly same side (non-zero d1,d2)

        // Avoid division by zero for horizontal edge not crossing
        if (Math.abs(p1w.z - p2w.z) < EPSILON_Z_PLANE) return null; 

        const t = (planeZ - p1w.z) / (p2w.z - p1w.z);
        
        // t should be within [0, 1] for segment intersection
        if (t >= -EPSILON_Z_PLANE && t <= 1.0 + EPSILON_Z_PLANE) { // Allow slight tolerance for t
           const intersect = p1w.clone().lerp(p2w, t);
           // Final check that the interpolated point is indeed on the plane
           if (Math.abs(intersect.z - planeZ) < EPSILON_Z_PLANE * 2) { 
             return intersect;
           }
        }
        return null;
    }

    wallFaceTriangles.forEach(face => { // face has v1,v2,v3 local
        const p_local = [face.v1, face.v2, face.v3];
        const p_world = p_local.map(p => p.clone().applyMatrix4(object.matrixWorld));

        let pointsOnOrCrossingPlane = []; // Stores unique Vector3 points for this face

        // 1. Add original vertices that are ON the plane
        p_world.forEach(pv_world => {
            if (Math.abs(pv_world.z - midPlaneZ) < EPSILON_Z_PLANE) {
                // Add if not already present (based on distance)
                if (!pointsOnOrCrossingPlane.find(p => p.distanceToSquared(pv_world) < EPSILON_SQUARED)) {
                    pointsOnOrCrossingPlane.push(pv_world);
                }
            }
        });

        // 2. Add intersection points from edges CROSSING the plane
        for (let i = 0; i < 3; i++) {
            const p1_world = p_world[i];
            const p2_world = p_world[(i + 1) % 3];
            
            // Only calculate intersection if edge truly crosses (i.e., endpoints not both on plane already)
            // and they are on opposite sides.
            const d1 = p1_world.z - midPlaneZ;
            const d2 = p2_world.z - midPlaneZ;

            if (!(Math.abs(d1) < EPSILON_Z_PLANE && Math.abs(d2) < EPSILON_Z_PLANE) && (d1 * d2 < -EPSILON_SQUARED) ) { // Check for opposite sides and not flat on plane
                 const intersect = getIntersectionPointWorld(p1_world, p2_world, midPlaneZ);
                 if (intersect) {
                    if (!pointsOnOrCrossingPlane.find(p => p.distanceToSquared(intersect) < EPSILON_SQUARED)) {
                        pointsOnOrCrossingPlane.push(intersect);
                    }
                 }
            }
        }
        
        // Form segments from the collected points
        if (pointsOnOrCrossingPlane.length === 2) {
            addEdgeIfUnique(pointsOnOrCrossingPlane[0], pointsOnOrCrossingPlane[1], midPlaneIntersectionEdgesWorld);
        } else if (pointsOnOrCrossingPlane.length === 3) {
            // Triangle is co-planar or formed 3 distinct points (e.g. one vertex on plane, other two cross)
            // Connect them: P0-P1, P1-P2, P2-P0 if they form a triangle.
            // However, if it was one vertex on plane (P0) and an edge crossing (P1, P2),
            // the segments would be P0-P1 and P0-P2 if P1,P2 were endpoints of the crossing segment.
            // The current collection method might simply list 3 points.
            // For a robust general case of N points on a plane from a single triangle's intersection,
            // they should form a line or a part of the triangle.
            // If 3 points, it's most likely the triangle's vertices are all on the plane.
            addEdgeIfUnique(pointsOnOrCrossingPlane[0], pointsOnOrCrossingPlane[1], midPlaneIntersectionEdgesWorld);
            addEdgeIfUnique(pointsOnOrCrossingPlane[1], pointsOnOrCrossingPlane[2], midPlaneIntersectionEdgesWorld);
            addEdgeIfUnique(pointsOnOrCrossingPlane[2], pointsOnOrCrossingPlane[0], midPlaneIntersectionEdgesWorld);
            console.warn("Mid-plane: Triangle resulted in 3 intersection/on-plane points. Assuming coplanar and adding its edges.");
        } else if (pointsOnOrCrossingPlane.length > 3) {
            console.warn(`Mid-plane: Triangle resulted in ${pointsOnOrCrossingPlane.length} intersection/on-plane points. This is unexpected. Skipping segments for this face.`);
        }
        // if length is 0 or 1, no segment is formed by this triangle alone.
    });

    console.log(`Mid-plane intersection edges (world coords) found: ${midPlaneIntersectionEdgesWorld.length}`);
    if (midPlaneIntersectionEdgesWorld.length === 0) {
        console.log("No mid-plane perimeter edges identified to visualize.");
        return;
    }

    // Stitch and Visualize (Adapted from processAndVisualizePerimeter)
    const orderedWorldVertices = [];
    const availableEdges = [...midPlaneIntersectionEdgesWorld]; 
    const stitchToleranceSq = 0.001 * 0.001;

    if (availableEdges.length > 0) {
        let currentEdge = availableEdges.shift();
        orderedWorldVertices.push(currentEdge.start); // Already world coords
        orderedWorldVertices.push(currentEdge.end);
        
        let attempts = 0;
        const maxAttempts = midPlaneIntersectionEdgesWorld.length + 5; 
        while (availableEdges.length > 0 && attempts < maxAttempts) {
            let lastVertexWorld = orderedWorldVertices[orderedWorldVertices.length - 1];
            let foundNext = false;
            for (let i = 0; i < availableEdges.length; i++) {
                let nextEdge = availableEdges[i]; // start and end are world
                if (lastVertexWorld.distanceToSquared(nextEdge.start) < stitchToleranceSq) {
                    orderedWorldVertices.push(nextEdge.end); availableEdges.splice(i, 1); foundNext = true; break;
                } else if (lastVertexWorld.distanceToSquared(nextEdge.end) < stitchToleranceSq) {
                    orderedWorldVertices.push(nextEdge.start); availableEdges.splice(i, 1); foundNext = true; break;
                }
            }
            if (!foundNext) { 
                console.warn(`Mid-plane perimeter stitch incomplete. Remaining edges: ${availableEdges.length}`); 
                break; 
            }
            attempts++;
        }
         if (attempts >= maxAttempts && availableEdges.length > 0) {
            console.warn(`Mid-plane perimeter stitch max attempts reached. Remaining edges: ${availableEdges.length}`);
        }
    }
    
    console.log(`Ordered world vertices for mid-plane perimeter path: ${orderedWorldVertices.length}`);

    if (orderedWorldVertices.length < 2) {
        console.log("Not enough ordered vertices for mid-plane perimeter tube.");
        return;
    }

    const curvePath = new THREE.CurvePath();
    for (let i = 0; i < orderedWorldVertices.length - 1; i++) {
        curvePath.add(new THREE.LineCurve3(orderedWorldVertices[i], orderedWorldVertices[i + 1]));
    }

    if (curvePath.curves.length > 0) {
        const boundingBox = new THREE.Box3().setFromObject(object);
        const sizeVec = boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        const pipeRadius = Math.max(0.01, maxDim * 0.0085); // Slightly thicker for distinction

        const tubeGeometry = new THREE.TubeGeometry(curvePath, Math.max(2, orderedWorldVertices.length * 2), pipeRadius, 8, false);
        const tubeMaterial = new THREE.MeshPhongMaterial({ color: tubeColor, emissive: new THREE.Color(tubeColor).multiplyScalar(0.25), side: THREE.DoubleSide });
        const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
        perimeterVizGroup.add(tubeMesh);
        console.log("Mid-plane perimeter tube created and added to scene.");
    } else {
        if (midPlaneIntersectionEdgesWorld.length > 0) {
             console.log("No curves generated for mid-plane perimeter tube geometry, though edges were found.");
        }
    }
}

function activateFaceSelectionMode() {
    if (selectionModeActive) return; // Already active
    selectionModeActive = true;
    console.log("Selection mode ACTIVATED.");
    selectTopFaceBtn.classList.add('active-selection');
    selectTopFaceBtn.textContent = 'Cancel'; 
    if(controls) controls.enabled = false; 
}

function deactivateFaceSelectionMode() {
    if (!selectionModeActive) return; // Already inactive
    selectionModeActive = false;
    console.log("Selection mode DEACTIVATED.");
    selectTopFaceBtn.classList.remove('active-selection');
    selectTopFaceBtn.textContent = 'Select Top Face';
    if(controls) controls.enabled = true; 
}

// This function is now only for the button's direct click action
function handleSelectTopFaceButtonClick() {
    if (selectionModeActive) {
        console.log("User clicked Cancel button.");
        deactivateFaceSelectionMode();
    } else {
        console.log("User clicked Select Top Face button.");
        activateFaceSelectionMode();
    }
}

if (selectTopFaceBtn) {
    // selectTopFaceBtn.addEventListener('click', toggleFaceSelectionMode); // OLD
    selectTopFaceBtn.addEventListener('click', handleSelectTopFaceButtonClick); // NEW
}

// Modify loadSTLFromFilePath and loadSTL to reset face colors
function resetObjectMaterial(objectToReset) {
    if (objectToReset && originalMaterial) {
        // If the current material is the vertexColor one, dispose it before assigning original
        if (objectToReset.material !== originalMaterial && objectToReset.material.dispose) {
            objectToReset.material.dispose();
        }
        objectToReset.material = originalMaterial.clone(); // Assign a clone to avoid shared state if originalMaterial is modified
    }
    // Only delete color attribute if it exists on the current geometry
    if (objectToReset && objectToReset.geometry && objectToReset.geometry.attributes.color) {
        objectToReset.geometry.deleteAttribute('color');
        // console.log("Vertex colors attribute removed.");
    }
    
    // It's important that originalMaterial itself is not vertex colored.
    // _setupNewModel ensures originalMaterial is the clean Phong material.

    if (perimeterVizGroup) {
        perimeterVizGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        // Only remove from parent if it's actually in the scene graph
        if (perimeterVizGroup.parent) perimeterVizGroup.parent.remove(perimeterVizGroup);
        perimeterVizGroup.clear(); 
    }

    if (selectionModeActive) {
        // console.log("Resetting object, deactivating selection mode.");
        deactivateFaceSelectionMode();
    }
}

// Ensure camera's 'up' is Z-up consistently
if (camera) camera.up.set(0,0,1);
if (controls) controls.object.up.set(0,0,1); // Also for controls if they manipulate camera directly
