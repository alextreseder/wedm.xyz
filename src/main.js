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

let processedPerimeters = { top: [], mid: [], bottom: [] };
let canvas2D, ctx2D;

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
    if (camera && renderer && view3DContainer && view3DContainer.style.display !== 'none') {
        const width = view3DContainer.clientWidth;
        const height = view3DContainer.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    if (canvas2D && ctx2D && view2D.style.display !== 'none') {
        // Ensure canvas logical size matches display size
        if (canvas2D.width !== canvas2D.clientWidth || canvas2D.height !== canvas2D.clientHeight) {
            canvas2D.width = canvas2D.clientWidth;
            canvas2D.height = canvas2D.clientHeight;
        }
        draw2DPerimeters(); // Redraw on resize
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
            init3DView();
            onWindowResize(); // Ensure 3D canvas is sized correctly
        } else if (viewToShow.id === 'view-2d') {
            init2DView(); // Initialize 2D canvas and context
            draw2DPerimeters(); // Draw current perimeters
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

// Function to handle face selection clicks
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
            MeshProcessor(intersect.object, intersect.face);
        } else {
            console.warn('Raycast intersection is not the main object or lacks face/geometry.', intersect);
        }
    }
}

// Helper function to check if a segment already exists in a list
function segmentExists(segmentList, p1, p2, toleranceSq) {
    for (const seg of segmentList) {
        if ((seg.start.distanceToSquared(p1) < toleranceSq && seg.end.distanceToSquared(p2) < toleranceSq) ||
            (seg.start.distanceToSquared(p2) < toleranceSq && seg.end.distanceToSquared(p1) < toleranceSq)) {
            return true;
        }
    }
    return false;
}

// Helper function to add a point to a list if it's not already present (within tolerance)
function addUniquePoint(pointList, point, toleranceSq) {
    if (!pointList.some(p => p.distanceToSquared(point) < toleranceSq)) {
        pointList.push(point.clone()); // Add a clone to avoid modifying original if point is reused
    }
}

// Helper to find intersection of an edge (p1, p2 in local space) with a Z-plane
function getIntersectionPointLocal(p1, p2, planeZ, epsilonZ) {
    const d1 = p1.z - planeZ;
    const d2 = p2.z - planeZ;
    const epsilonSq = epsilonZ * epsilonZ * 0.01; // Smaller for d1*d2 check

    // Edge is nearly on the plane (both points close)
    if (Math.abs(d1) < epsilonZ && Math.abs(d2) < epsilonZ) return null; 
    // Edge is entirely on one side of the plane (and not on the plane itself)
    if (d1 * d2 > epsilonSq) return null; 
    // Horizontal edge not crossing (and not on plane, caught above)
    if (Math.abs(p1.z - p2.z) < epsilonZ) return null; 

    const t = (planeZ - p1.z) / (p2.z - p1.z);
    // Check if t is within segment bounds (inclusive, with small tolerance)
    if (t >= -epsilonZ && t <= 1.0 + epsilonZ) { 
       const intersect = p1.clone().lerp(p2, t);
       // Final check that the interpolated point is indeed on the plane
       if (Math.abs(intersect.z - planeZ) < epsilonZ * 2) { // Allow slightly larger tolerance for interpolated point
         return intersect;
       }
    }
    return null;
}

function MeshProcessor(object, selectedFaceObject) {
    if (!object || !object.geometry || !selectedFaceObject || 
        !selectedFaceObject.normal || typeof selectedFaceObject.a === 'undefined') { 
        console.error("MeshProcessor: Invalid inputs. Aborting.", { object, geometry: object ? object.geometry : null, selectedFaceObject });
        deactivateFaceSelectionMode();
        return;
    }
    let displayGeometry = object.geometry;
    if (displayGeometry.index) {
        const nonIndexedDisplayGeom = displayGeometry.toNonIndexed();
        object.geometry = nonIndexedDisplayGeom; 
        displayGeometry = nonIndexedDisplayGeom;
    }
    const numVerticesDisplay = displayGeometry.attributes.position.count;
    if (!displayGeometry.attributes.color || displayGeometry.attributes.color.count !== numVerticesDisplay) {
        displayGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(numVerticesDisplay * 3), 3));
    }
    const colorsAttributeDisplay = displayGeometry.attributes.color;
    for (let i = 0; i < colorsAttributeDisplay.array.length; i++) { colorsAttributeDisplay.array[i] = 0; }
    let processedGeometry = object.geometry.clone(); 
    const { attributes } = processedGeometry;
    const positionsProcessed = attributes.position;
    const clickedNormalLocalOriginal = selectedFaceObject.normal.clone(); 
    const targetNormalLocal = new THREE.Vector3(0, 0, 1);
    const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(clickedNormalLocalOriginal, targetNormalLocal);
    processedGeometry.applyQuaternion(rotationQuaternion);
    let minZ = Infinity;
    for (let i = 0; i < positionsProcessed.count; i++) { minZ = Math.min(minZ, positionsProcessed.getZ(i)); }
    processedGeometry.translate(0, 0, -minZ);
    const vAIndex = selectedFaceObject.a; 
    const selectionZ = positionsProcessed.getZ(vAIndex);
    if (isNaN(selectionZ)) {
        console.error("MeshProcessor: selectionZ is NaN! Aborting processing.");
        processedGeometry.dispose();
        deactivateFaceSelectionMode();
        return;
    }

    // Calculate MidPlane Z (in processedGeometry's local space)
    let midPlaneZ = NaN;
    const MIN_THICKNESS_FOR_MIDPLANE = 0.01; // Minimum thickness to attempt midplane
    if (selectionZ > MIN_THICKNESS_FOR_MIDPLANE) { // selectionZ is top, 0 is bottom
        midPlaneZ = selectionZ / 2.0;
    } else {
        console.log("MeshProcessor: Object too thin or selectionZ invalid for mid-plane calculation.");
    }

    // 5. Process each triangle in processedGeometry
    const EPSILON_Z = 0.001; 
    const SEGMENT_UNIQUENESS_TOLERANCE_SQ = EPSILON_Z * EPSILON_Z * 0.1;
    const POINT_UNIQUENESS_TOLERANCE_SQ = SEGMENT_UNIQUENESS_TOLERANCE_SQ; // Can be same or different
    let topPerimeterSegmentsLocal = [];    
    let bottomPerimeterSegmentsLocal = []; 
    let midPlanePerimeterSegmentsLocal = [];

    for (let i = 0; i < positionsProcessed.count; i += 3) {
        const triIndices = [i, i + 1, i + 2];
        const v1 = new THREE.Vector3().fromBufferAttribute(positionsProcessed, triIndices[0]);
        const v2 = new THREE.Vector3().fromBufferAttribute(positionsProcessed, triIndices[1]);
        const v3 = new THREE.Vector3().fromBufferAttribute(positionsProcessed, triIndices[2]);
        const triVerticesLocal = [v1, v2, v3]; // Vertices in processedGeometry local space

        const z_coords = triVerticesLocal.map(v => v.z);
        let count_selectionZ = 0, count_zero = 0;
        let vertices_at_selectionZ_indices = [], vertices_at_zero_indices = [];

        for (let j = 0; j < 3; j++) {
            if (Math.abs(z_coords[j] - selectionZ) < EPSILON_Z) {
                count_selectionZ++; vertices_at_selectionZ_indices.push(triIndices[j]); // Store original indices
            }
            if (Math.abs(z_coords[j] - 0) < EPSILON_Z) {
                count_zero++; vertices_at_zero_indices.push(triIndices[j]); // Store original indices
            }
        }

        let faceColor = WALL_FACE_COLOR; 
        let isWallFace = true;

        if (count_selectionZ === 3) {
            faceColor = TOP_FACE_COLOR; isWallFace = false;
        } else if (count_zero === 3) {
            faceColor = BOTTOM_FACE_COLOR; isWallFace = false;
        } else if (count_selectionZ === 2) { 
            faceColor = WALL_FACE_COLOR;
            // Use actual vertex objects from triVerticesLocal for segmentExists
            const pA = triVerticesLocal[vertices_at_selectionZ_indices[0] % 3]; // Get corresponding vertex from triVerticesLocal
            const pB = triVerticesLocal[vertices_at_selectionZ_indices[1] % 3];
            if (!segmentExists(topPerimeterSegmentsLocal, pA, pB, SEGMENT_UNIQUENESS_TOLERANCE_SQ)) {
                topPerimeterSegmentsLocal.push({ start: pA.clone(), end: pB.clone() });
            }
        } else if (count_zero === 2) { 
            faceColor = WALL_FACE_COLOR;
            const pA = triVerticesLocal[vertices_at_zero_indices[0] % 3];
            const pB = triVerticesLocal[vertices_at_zero_indices[1] % 3];
            if (!segmentExists(bottomPerimeterSegmentsLocal, pA, pB, SEGMENT_UNIQUENESS_TOLERANCE_SQ)) {
                bottomPerimeterSegmentsLocal.push({ start: pA.clone(), end: pB.clone() });
            }
        } // Other cases are walls by default

        colorsAttributeDisplay.setXYZ(triIndices[0], faceColor.r, faceColor.g, faceColor.b);
        colorsAttributeDisplay.setXYZ(triIndices[1], faceColor.r, faceColor.g, faceColor.b);
        colorsAttributeDisplay.setXYZ(triIndices[2], faceColor.r, faceColor.g, faceColor.b);

        // Mid-plane intersection for wall faces
        if (isWallFace && !isNaN(midPlaneZ)) {
            let pointsOnOrCrossingMidPlane = [];
            // 1. Check vertices of the triangle
            triVerticesLocal.forEach(vertex => {
                if (Math.abs(vertex.z - midPlaneZ) < EPSILON_Z) {
                    addUniquePoint(pointsOnOrCrossingMidPlane, vertex, POINT_UNIQUENESS_TOLERANCE_SQ);
                }
            });
            // 2. Check edge intersections with midPlaneZ
            for (let k = 0; k < 3; k++) {
                const pt1 = triVerticesLocal[k];
                const pt2 = triVerticesLocal[(k + 1) % 3];
                const intersectPt = getIntersectionPointLocal(pt1, pt2, midPlaneZ, EPSILON_Z);
                if (intersectPt) {
                    addUniquePoint(pointsOnOrCrossingMidPlane, intersectPt, POINT_UNIQUENESS_TOLERANCE_SQ);
                }
            }

            if (pointsOnOrCrossingMidPlane.length === 2) {
                if (!segmentExists(midPlanePerimeterSegmentsLocal, pointsOnOrCrossingMidPlane[0], pointsOnOrCrossingMidPlane[1], SEGMENT_UNIQUENESS_TOLERANCE_SQ)) {
                    midPlanePerimeterSegmentsLocal.push({ start: pointsOnOrCrossingMidPlane[0].clone(), end: pointsOnOrCrossingMidPlane[1].clone() });
                }
            } else if (pointsOnOrCrossingMidPlane.length === 3) { // Triangle coplanar with mid-plane
                const p0 = pointsOnOrCrossingMidPlane[0];
                const p1 = pointsOnOrCrossingMidPlane[1];
                const p2 = pointsOnOrCrossingMidPlane[2];
                if (!segmentExists(midPlanePerimeterSegmentsLocal, p0, p1, SEGMENT_UNIQUENESS_TOLERANCE_SQ)) midPlanePerimeterSegmentsLocal.push({ start: p0.clone(), end: p1.clone() });
                if (!segmentExists(midPlanePerimeterSegmentsLocal, p1, p2, SEGMENT_UNIQUENESS_TOLERANCE_SQ)) midPlanePerimeterSegmentsLocal.push({ start: p1.clone(), end: p2.clone() });
                if (!segmentExists(midPlanePerimeterSegmentsLocal, p2, p0, SEGMENT_UNIQUENESS_TOLERANCE_SQ)) midPlanePerimeterSegmentsLocal.push({ start: p2.clone(), end: p0.clone() });
            } // Ignore if 0, 1 or >3 points
        }
    }
    colorsAttributeDisplay.needsUpdate = true;
    console.log(`MeshProcessor: Unique Segments Local - Top: ${topPerimeterSegmentsLocal.length}, Bottom: ${bottomPerimeterSegmentsLocal.length}, Mid: ${midPlanePerimeterSegmentsLocal.length}`);

    // Update material of currentObject to use vertex colors
    if (!originalMaterial) { originalMaterial = object.material.clone(); }
    object.material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: originalMaterial.shininess !== undefined ? originalMaterial.shininess : 50,
        specular: originalMaterial.specular ? (originalMaterial.specular.isColor ? originalMaterial.specular.getHex() : 0x111111) : 0x111111,
    });

    // 6. Visualize Perimeters
    if (perimeterVizGroup) {
        perimeterVizGroup.children.forEach(child => { 
            if (child.geometry) child.geometry.dispose(); 
            if (child.material) child.material.dispose(); 
        });
        if (perimeterVizGroup.parent) perimeterVizGroup.parent.remove(perimeterVizGroup);
        perimeterVizGroup.clear();
    } else {
        perimeterVizGroup = new THREE.Group();
        scene.add(perimeterVizGroup);
    }

    const invRotationQuaternion = rotationQuaternion.clone().invert();
    const invTranslationVector = new THREE.Vector3(0, 0, minZ); 
    const transformProcessedLocalToWorld = (localPoint) => {
        const pointInOriginalLocalSpace = localPoint.clone()
            .add(invTranslationVector)        
            .applyQuaternion(invRotationQuaternion); 
        return pointInOriginalLocalSpace.applyMatrix4(object.matrixWorld); 
    };

    const topPerimeterSegmentsWorld = topPerimeterSegmentsLocal.map(seg => ({
        start: transformProcessedLocalToWorld(seg.start),
        end: transformProcessedLocalToWorld(seg.end)
    }));
    const bottomPerimeterSegmentsWorld = bottomPerimeterSegmentsLocal.map(seg => ({
        start: transformProcessedLocalToWorld(seg.start),
        end: transformProcessedLocalToWorld(seg.end)
    }));
    const midPlanePerimeterSegmentsWorld = midPlanePerimeterSegmentsLocal.map(seg => ({
        start: transformProcessedLocalToWorld(seg.start),
        end: transformProcessedLocalToWorld(seg.end)
    }));    
    
    if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere(); 
    const basePipeRadius = object.geometry.boundingSphere ? Math.max(0.005, object.geometry.boundingSphere.radius * 0.0075) : 0.01;

    // Clear previous perimeters before populating
    processedPerimeters = { top: [], mid: [], bottom: [] };

    if (topPerimeterSegmentsWorld.length > 0) {
      visualizePerimeterFromSegments(topPerimeterSegmentsWorld, 0xffff00, "top_new", basePipeRadius, perimeterVizGroup, processedPerimeters.top);
    }
    if (bottomPerimeterSegmentsWorld.length > 0) {
      visualizePerimeterFromSegments(bottomPerimeterSegmentsWorld, 0xadd8e6, "bottom_new", basePipeRadius, perimeterVizGroup, processedPerimeters.bottom);
    }
    if (midPlanePerimeterSegmentsWorld.length > 0) {
      visualizePerimeterFromSegments(midPlanePerimeterSegmentsWorld, 0x00ff00, "mid_new", basePipeRadius * 0.8, perimeterVizGroup, processedPerimeters.mid);
    }
    
    processedGeometry.dispose(); 
    deactivateFaceSelectionMode();
}

function visualizePerimeterFromSegments(segmentsWorld, tubeColor, perimeterType, basePipeRadius, targetGroup, outputPathStore) {
    if (segmentsWorld.length === 0) return;

    const allPaths = []; 
    let availableSegments = [...segmentsWorld]; 
    const stitchToleranceSq = 0.001 * 0.001; 

    while (availableSegments.length > 0) {
        let currentPathPoints = [];
        let initialSegment = availableSegments.shift(); 
        currentPathPoints.push(initialSegment.start.clone());
        currentPathPoints.push(initialSegment.end.clone());
        let pathExtendedInLoop;
        do {
            pathExtendedInLoop = false;
            let lastPoint = currentPathPoints[currentPathPoints.length - 1];
            for (let i = availableSegments.length - 1; i >= 0; i--) {
                let segment = availableSegments[i];
                if (lastPoint.distanceToSquared(segment.start) < stitchToleranceSq) {
                    currentPathPoints.push(segment.end.clone());
                    availableSegments.splice(i, 1);
                    pathExtendedInLoop = true; break; 
                } else if (lastPoint.distanceToSquared(segment.end) < stitchToleranceSq) {
                    currentPathPoints.push(segment.start.clone());
                    availableSegments.splice(i, 1);
                    pathExtendedInLoop = true; break; 
                }
            }
            if (pathExtendedInLoop) continue; 
            let firstPoint = currentPathPoints[0];
            for (let i = availableSegments.length - 1; i >= 0; i--) {
                let segment = availableSegments[i];
                if (firstPoint.distanceToSquared(segment.end) < stitchToleranceSq) {
                    currentPathPoints.unshift(segment.start.clone()); 
                    availableSegments.splice(i, 1);
                    pathExtendedInLoop = true; break; 
                } else if (firstPoint.distanceToSquared(segment.start) < stitchToleranceSq) {
                    currentPathPoints.unshift(segment.end.clone()); 
                    availableSegments.splice(i, 1);
                    pathExtendedInLoop = true; break; 
                }
            }
        } while (pathExtendedInLoop); 
        if (currentPathPoints.length >= 2) {
            allPaths.push(currentPathPoints);
            if (outputPathStore) {
                // Store a clone of the path points (which are THREE.Vector3)
                outputPathStore.push(currentPathPoints.map(p => p.clone())); 
            }
        }
    }
    
    if (allPaths.length === 0 && segmentsWorld.length > 0) {
        console.warn(`visualizePerimeterFromSegments: Could not form continuous paths for ${perimeterType}. Visualizing individual segments as fallback.`);
        segmentsWorld.forEach((seg) => {
            const singleSegmentPath = new THREE.CurvePath();
            singleSegmentPath.add(new THREE.LineCurve3(seg.start, seg.end));
            if (singleSegmentPath.curves.length > 0) {
                const pipeRadius = basePipeRadius * 0.75; 
                const tubeGeometry = new THREE.TubeGeometry(singleSegmentPath, 1, pipeRadius, 6, false);
                const tubeMaterial = new THREE.MeshPhongMaterial({ color: tubeColor, emissive: new THREE.Color(tubeColor).multiplyScalar(0.1), side: THREE.DoubleSide });
                const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
                targetGroup.add(tubeMesh);
            }
        });
        return;
    }

    allPaths.forEach((pathVertices) => {
        if (pathVertices.length < 2) return;
        const curvePath = new THREE.CurvePath();
        for (let j = 0; j < pathVertices.length - 1; j++) {
            curvePath.add(new THREE.LineCurve3(pathVertices[j], pathVertices[j+1]));
        }
        if (curvePath.curves.length > 0) {
            let radiusScale = 1.0;
            if (perimeterType === "top_new") radiusScale = 1.0;
            else if (perimeterType === "bottom_new") radiusScale = 0.9;
            const pipeRadius = Math.max(0.005, basePipeRadius * radiusScale); 
            const tubularSegmentsCount = curvePath.curves.length; 
            const radialSegmentsCount = 6; 
            const tubeGeometry = new THREE.TubeGeometry(curvePath, tubularSegmentsCount, pipeRadius, radialSegmentsCount, false);
            const tubeMaterial = new THREE.MeshPhongMaterial({ color: tubeColor, emissive: new THREE.Color(tubeColor).multiplyScalar(0.2), side: THREE.DoubleSide });
            const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
            targetGroup.add(tubeMesh);
        }
    });
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

    // Clear stored perimeters
    processedPerimeters = { top: [], mid: [], bottom: [] };
    if (canvas2D && ctx2D && view2D.style.display === 'block') {
        // If 2D view is active, clear it
        ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
        ctx2D.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-dark').trim() || '#242526';
        ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
        draw2DPerimeters(); // Redraw (will show placeholder if no perimeters)
    }
}

// Ensure camera's 'up' is Z-up consistently
if (camera) camera.up.set(0,0,1);
if (controls) controls.object.up.set(0,0,1); // Also for controls if they manipulate camera directly

function init2DView() {
    if (!canvas2D) {
        const canvas = document.getElementById('canvas-2d');
        if (canvas) {
            canvas2D = canvas;
            ctx2D = canvas2D.getContext('2d');
        } else {
            console.error("2D Canvas element not found!");
            return;
        }
    }
    // Ensure canvas dimensions are up-to-date with its CSS-defined size
    if (canvas2D.width !== canvas2D.clientWidth || canvas2D.height !== canvas2D.clientHeight) {
        canvas2D.width = canvas2D.clientWidth;
        canvas2D.height = canvas2D.clientHeight;
    }
}

function draw2DPerimeters() {
    if (!ctx2D || !canvas2D) {
        console.log("2D context or canvas not ready for drawing.");
        if (view2D.style.display === 'block') init2DView(); // Try to init if active
        if (!ctx2D || !canvas2D) return; // Still not ready, exit
    }

    ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
    ctx2D.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-dark').trim() || '#242526';
    ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);

    const allPoints = [];
    ['top', 'mid', 'bottom'].forEach(type => {
        processedPerimeters[type].forEach(path => {
            path.forEach(point => allPoints.push(point));
        });
    });

    if (allPoints.length === 0) {
        // console.log("No perimeters to draw in 2D view.");
        ctx2D.font = "16px Arial";
        ctx2D.fillStyle = "#cccccc";
        ctx2D.textAlign = "center";
        ctx2D.fillText("No perimeters selected or calculated.", canvas2D.width / 2, canvas2D.height / 2);
        return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    });

    const padding = 20;
    const availableWidth = canvas2D.width - 2 * padding;
    const availableHeight = canvas2D.height - 2 * padding;
    const dataWidth = maxX - minX;
    const dataHeight = maxY - minY;

    let scale;
    if (dataWidth === 0 && dataHeight === 0) scale = 1;
    else if (dataWidth === 0) scale = availableHeight / (dataHeight || 1); // Avoid div by zero if dataHeight is also 0
    else if (dataHeight === 0) scale = availableWidth / (dataWidth || 1); // Avoid div by zero
    else scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
    
    const offsetX = padding + (availableWidth - dataWidth * scale) / 2 - minX * scale;
    const offsetY = padding + (availableHeight - dataHeight * scale) / 2 - minY * scale; // Y is typically inverted in canvas
    // Correcting offsetY for canvas coordinate system (top-left is 0,0)
    // const offsetY = padding + (availableHeight - dataHeight * scale) / 2 + maxY * scale; // this would flip it vertically
    // To keep same orientation as 3D view (Y up), we draw from maxY downwards
    const correctedOffsetY = padding + (availableHeight - dataHeight * scale) / 2 + maxY * scale;


    const drawPath = (path, color) => {
        if (path.length < 2) return;
        ctx2D.beginPath();
        const firstPt = path[0];
        ctx2D.moveTo(firstPt.x * scale + offsetX, canvas2D.height - (firstPt.y * scale + offsetY)); // Invert Y for drawing
        // Corrected drawing: Use correctedOffsetY and ensure consistent Y inversion
        ctx2D.moveTo(firstPt.x * scale + offsetX, correctedOffsetY - firstPt.y * scale); 

        for (let i = 1; i < path.length; i++) {
            const pt = path[i];
            ctx2D.lineTo(pt.x * scale + offsetX, correctedOffsetY - pt.y * scale);
        }
        // Check if it's a closed loop (optional, based on how paths are generated)
        // For now, assume they are open paths from segments
        ctx2D.strokeStyle = color;
        ctx2D.lineWidth = 2;
        ctx2D.stroke();
    };

    processedPerimeters.top.forEach(path => drawPath(path, '#FFFF00')); // Yellow
    processedPerimeters.mid.forEach(path => drawPath(path, '#00FF00')); // Green
    processedPerimeters.bottom.forEach(path => drawPath(path, '#ADD8E6')); // Light Blue
}

