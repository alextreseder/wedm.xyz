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
const downloadPolylinesBtn = document.getElementById('download-polylines-btn');
const downloadEdmResultsBtn = document.getElementById('download-edm-results-btn');
const generatePathsBtn = document.getElementById('generate-paths-btn');
const clearPathsBtn = document.getElementById('clear-paths-btn');
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
let solutionVizGroup; // New group for 3D solution line visualization

let selectionModeActive = false; // New state for selection mode
const raycaster = new THREE.Raycaster(); // For face selection
const mouse = new THREE.Vector2(); // For raycaster

// Colors for faces
const TOP_FACE_COLOR = new THREE.Color(0xCBC3E3); // Light Purple
const BOTTOM_FACE_COLOR = new THREE.Color(0xAFEEEE); // Light Cyan / PaleTurquoise
const WALL_FACE_COLOR = new THREE.Color(0xFFDAB9); // Light Orange / PeachPuff

let processedPerimeters = { top: [], mid: [], bottom: [] };
let allSolutions = []; // To store results from EDM CAM algorithm
let canvas2D, ctx2D;

const buttonsToDisableDuringCalc = [
    generatePathsBtn, selectTopFaceBtn, 
    loadStlBtn, loadGearBtn, loadLoftBtn,
    downloadPolylinesBtn, downloadEdmResultsBtn, clearPathsBtn
];

// Helper Functions for EDM CAM Algorithm

function normalizeAngleDegrees(angle) {
    let normalized = angle % 360;
    if (normalized < 0) {
        normalized += 360;
    }
    return normalized;
}

function mergeAngleRanges(ranges) {
    if (!ranges || ranges.length === 0) return [];

    // Normalize all ranges to be within [0, 360) and handle wrap-around
    const normalizedRanges = [];
    ranges.forEach(range => {
        let start = normalizeAngleDegrees(range[0]);
        let end = normalizeAngleDegrees(range[1]);
        if (start > end) { // Wraps around 360, e.g., [350, 10]
            normalizedRanges.push([start, 360]);
            normalizedRanges.push([0, end]);
        } else {
            normalizedRanges.push([start, end]);
        }
    });

    if (normalizedRanges.length === 0) return [];

    // Sort ranges by start angle
    normalizedRanges.sort((a, b) => a[0] - b[0]);

    const merged = [];
    let currentRange = normalizedRanges[0];

    for (let i = 1; i < normalizedRanges.length; i++) {
        const nextRange = normalizedRanges[i];
        if (nextRange[0] <= currentRange[1] + 0.01) { // +0.01 for small overlaps due to precision
            // Overlapping or adjacent
            currentRange[1] = Math.max(currentRange[1], nextRange[1]);
        } else {
            // Non-overlapping
            merged.push(currentRange);
            currentRange = nextRange;
        }
    }
    merged.push(currentRange); // Add the last processed range

    // Final check for merging a range like [355, 360] with [0, 5]
    // This specific case should already be handled by the split if the input was [355, 5]
    // However, if we had separate [350,360] and [0,10] from different coarse hits, they might need merging.
    // The current sort and merge should handle this if they become adjacent after normalization.
    // E.g. if merged has [..., [350,360]] and [ [0,10], ...]
    // This specific cross-360 merge is tricky if they are not first and last after sort.
    // The current logic might not perfectly merge [350, 360] and [0, 10] if they are not sorted to be first/last and adjacent.
    // For simplicity, let's assume the split and sort mostly covers it.
    // A more robust solution might explicitly check if merged[0].start === 0 and merged[last].end === 360
    // and if they are from a wrapped range.

    return merged;
}


// p1, p2 define the first line segment. p3, p4 define the second line segment.
function lineSegmentIntersection(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (d === 0) return null; // Parallel lines

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y)
        };
    }
    return null; // Intersection point is not within both segments
}

function getRayPolylineIntersection(rayOrigin, angleDegrees, polylinePoints, isClosed = true) {
    if (!polylinePoints || polylinePoints.length < 2) return null;

    const angleRadians = angleDegrees * (Math.PI / 180);
    // Create a very long ray endpoint
    const rayEndPoint = {
        x: rayOrigin.x + Math.cos(angleRadians) * 1e6, // 1e6 is effectively infinity for typical scales
        y: rayOrigin.y + Math.sin(angleRadians) * 1e6
    };

    let closestIntersection = null;
    let minDistanceSq = Infinity;

    for (let i = 0; i < polylinePoints.length; i++) {
        const p1 = polylinePoints[i];
        const p2 = polylinePoints[(i + 1) % polylinePoints.length];

        if (!isClosed && i === polylinePoints.length - 1) continue; // Don't connect last to first if not closed

        const intersection = lineSegmentIntersection(rayOrigin, rayEndPoint, p1, p2);

        if (intersection) {
            const dx = intersection.x - rayOrigin.x;
            const dy = intersection.y - rayOrigin.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestIntersection = {
                    x: intersection.x,
                    y: intersection.y,
                    length: Math.sqrt(distanceSq)
                };
            }
        }
    }
    return closestIntersection;
}

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

    // Initialize and add visualization groups
    if (!perimeterVizGroup) {
        perimeterVizGroup = new THREE.Group();
        scene.add(perimeterVizGroup);
    }
    if (!solutionVizGroup) { // Initialize and add the new group
        solutionVizGroup = new THREE.Group();
        scene.add(solutionVizGroup);
    }

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
        if (canvas2D.width !== canvas2D.clientWidth || canvas2D.height !== canvas2D.clientHeight) {
            canvas2D.width = canvas2D.clientWidth;
            canvas2D.height = canvas2D.clientHeight;
        }
        draw2DPerimeters();
        drawEDMSolutionLines();
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
            onWindowResize();
        } else if (viewToShow.id === 'view-2d') {
            init2DView();
            draw2DPerimeters();
            drawEDMSolutionLines();
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

    // 6. Visualize Perimeters (Corrected Clearing Logic)
    if (perimeterVizGroup) {
        perimeterVizGroup.children.forEach(child => { 
            if (child.geometry) child.geometry.dispose(); 
            if (child.material) child.material.dispose(); 
        });
        // DO NOT remove perimeterVizGroup from its parent here.
        // if (perimeterVizGroup.parent) perimeterVizGroup.parent.remove(perimeterVizGroup); // THIS WAS THE BUG
        perimeterVizGroup.clear(); // Just clear its children
    } else {
        // This else block should ideally not be hit if init3DView correctly sets up perimeterVizGroup.
        console.warn("MeshProcessor: perimeterVizGroup was null, re-initializing.");
        perimeterVizGroup = new THREE.Group();
        if(scene) scene.add(perimeterVizGroup); // Add to scene if scene exists
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
    processedPerimeters = { top: [], mid: [], bottom: [] }; // Clear before populating
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

if (downloadPolylinesBtn) {
    downloadPolylinesBtn.addEventListener('click', handleDownloadPolylines);
}

if (downloadEdmResultsBtn) {
    downloadEdmResultsBtn.addEventListener('click', handleDownloadEDMResults);
}

if (generatePathsBtn) {
    generatePathsBtn.addEventListener('click', async () => { // Make event handler async
        if (!currentObject || !processedPerimeters.top.length || !processedPerimeters.mid.length || !processedPerimeters.bottom.length) {
            alert("Please load an STL, select a top face (which calculates perimeters), and ensure all three perimeters (top, mid, bottom) are available before generating EDM paths.");
            return;
        }
        // console.log("Starting EDM CAM path calculation..."); // Moved inside the async function
        await calculateAndVisualizeEDMPaths(); // Await the async calculation
    });
}

if (clearPathsBtn) {
    clearPathsBtn.addEventListener('click', () => {
        console.log("Clearing EDM solutions and perimeters visualisations, and redrawing 2D view.");
        allSolutions = [];
        // Clear 2D canvas first
        if (ctx2D && canvas2D && view2D.style.display === 'block') {
            draw2DPerimeters(); // Redraws perimeters, effectively clearing old solution lines if any drawn on top
        }
        // Clear 3D solution visualizations
        if (solutionVizGroup) {
            solutionVizGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            solutionVizGroup.clear();
        }
        // Optionally, if "Clear Paths" should also clear the base perimeters from MeshProcessor:
        // processedPerimeters = { top: [], mid: [], bottom: [] };
        // if (perimeterVizGroup) { /* clear perimeterVizGroup too */ }
        // if (currentObject) { resetObjectMaterial(currentObject); } // This would also clear face colors
    });
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
    if (solutionVizGroup) { // Clear 3D solution visualizations
        solutionVizGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        if (solutionVizGroup.parent) solutionVizGroup.parent.remove(solutionVizGroup);
        solutionVizGroup.clear();
    }

    if (selectionModeActive) {
        // console.log("Resetting object, deactivating selection mode.");
        deactivateFaceSelectionMode();
    }

    // Clear stored perimeters
    processedPerimeters = { top: [], mid: [], bottom: [] };
    allSolutions = []; // Clear EDM solutions

    if (canvas2D && ctx2D && view2D.style.display === 'block') {
        draw2DPerimeters(); // This will clear and draw placeholder or empty perimeters
        // drawEDMSolutionLines(); // Not needed here as allSolutions is empty
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

function formatPolylinesForDownload() {
    let content = "";

    const formatSection = (sectionName, paths) => {
        if (paths.length > 0) {
            content += sectionName + "\n";
            paths.forEach(path => {
                path.forEach(point => {
                    // Format to a reasonable number of decimal places, e.g., 4
                    content += point.x.toFixed(4) + " " + point.y.toFixed(4) + "\n";
                });
                // Add a separator if a section has multiple paths, though currently each section has one array of paths.
                // If a single section (e.g. top) could have disjoint loops, this might be useful.
                // For now, each "path" in processedPerimeters.top is an array of points for ONE polyline.
                // If processedPerimeters.top could be [ [p1,p2,...], [pA,pB,...] ] for two separate top loops,
                // then we might want a separator here. Current structure implies one list of paths per type.
            });
        }
    };

    formatSection("TOP", processedPerimeters.top);
    formatSection("MIDDLE", processedPerimeters.mid);
    formatSection("BOTTOM", processedPerimeters.bottom);

    return content;
}

function handleDownloadPolylines() {
    const fileContent = formatPolylinesForDownload();
    if (!fileContent.trim()) {
        alert("No polylines to download. Please select a top face first to calculate perimeters.");
        return;
    }

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'polylines.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Polyline data download initiated.");
}

async function calculateAndVisualizeEDMPaths() {
    let originalButtonText = 'Generate Paths & G-Code';
    if (generatePathsBtn) originalButtonText = generatePathsBtn.textContent;
    let transformParams = null; 

    try {
        buttonsToDisableDuringCalc.forEach(btn => { if(btn) btn.disabled = true; });
        if (generatePathsBtn) generatePathsBtn.textContent = 'Calculating...';
        
        allSolutions = []; 
        console.log("Starting EDM CAM path calculation...");

        if (view2D.style.display === 'block') {
            init2DView(); 
            draw2DPerimeters(); 
        } else {
            init2DView(); 
        }
        if (canvas2D && ctx2D) { 
            const allPerimPoints2D = [];
            ['top', 'mid', 'bottom'].forEach(type => {
                processedPerimeters[type].forEach(path => {
                    path.forEach(point => allPerimPoints2D.push(point)); 
                });
            });
            if (allPerimPoints2D.length > 0) {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                allPerimPoints2D.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                const padding = 20;
                const availableWidth = canvas2D.width - 2 * padding;
                const availableHeight = canvas2D.height - 2 * padding;
                const dataWidth = maxX - minX; const dataHeight = maxY - minY;
                let scale;
                if (dataWidth === 0 && dataHeight === 0) scale = 1;
                else if (dataWidth === 0) scale = availableHeight / (dataHeight || 1);
                else if (dataHeight === 0) scale = availableWidth / (dataWidth || 1);
                else scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
                transformParams = {
                    scale: scale,
                    offsetX: padding + (availableWidth - dataWidth * scale) / 2 - minX * scale,
                    correctedOffsetY: padding + (availableHeight - dataHeight * scale) / 2 + maxY * scale,
                };
            }
        }

        const convertPath = (pathArray) => pathArray.map(p => ({ x: p.x, y: p.y }));
        const topPolyline = processedPerimeters.top.length > 0 ? convertPath(processedPerimeters.top[0]) : null;
        const middlePolyline = processedPerimeters.mid.length > 0 ? convertPath(processedPerimeters.mid[0]) : null;
        const bottomPolyline = processedPerimeters.bottom.length > 0 ? convertPath(processedPerimeters.bottom[0]) : null;
        if (!topPolyline || !middlePolyline || !bottomPolyline) {
            alert("One or more required perimeters (top, middle, bottom) are missing. Cannot calculate EDM paths.");
            return; 
        }
        if (middlePolyline.length === 0) {
            alert("Middle perimeter has no points. Cannot calculate EDM paths.");
            return; 
        }
        console.log(`Starting EDM calculation for ${middlePolyline.length} points on the middle perimeter.`);
        const startTime = performance.now();

        for (const currentOriginPoint of middlePolyline) {
            let coarseHitThetas = [];
            for (let coarseTheta = 0; coarseTheta < 360; coarseTheta += 10) {
                const topIntersection = getRayPolylineIntersection(currentOriginPoint, coarseTheta, topPolyline, true);
                const bottomIntersection = getRayPolylineIntersection(currentOriginPoint, coarseTheta + 180, bottomPolyline, true);
                if (topIntersection && bottomIntersection) {
                    coarseHitThetas.push(coarseTheta);
                }
            }
            if (coarseHitThetas.length > 0) {
                const potentialRanges = coarseHitThetas.map(theta => [theta - 10, theta + 10]);
                const validFineScanRanges = mergeAngleRanges(potentialRanges);
                if (validFineScanRanges.length > 0) {
                    let pointScanResults = [];
                    validFineScanRanges.forEach(validRange => {
                        for (let fineTheta = validRange[0]; fineTheta <= validRange[1]; fineTheta += 0.1) {
                            const normalizedFineTheta = normalizeAngleDegrees(fineTheta);
                            const topHit = getRayPolylineIntersection(currentOriginPoint, normalizedFineTheta, topPolyline, true);
                            const bottomHit = getRayPolylineIntersection(currentOriginPoint, normalizedFineTheta + 180, bottomPolyline, true);
                            if (topHit && bottomHit) {
                                const topLength = topHit.length; const bottomLength = bottomHit.length;
                                const costValue = Math.abs(topLength - bottomLength) + Math.max(topLength, bottomLength);
                                pointScanResults.push({ angle: normalizedFineTheta, cost: costValue, topLength: topLength, bottomLength: bottomLength, topPoint: {x: topHit.x, y: topHit.y}, bottomPoint: {x: bottomHit.x, y: bottomHit.y}});
                            }
                        }
                    });
                    if (pointScanResults.length > 0) {
                        let minCostData = pointScanResults.reduce((min, current) => (current.cost < min.cost ? current : min), pointScanResults[0]);
                        const newSolution = { origin: currentOriginPoint, theta: minCostData.angle, topPoint: minCostData.topPoint, bottomPoint: minCostData.bottomPoint };
                        allSolutions.push(newSolution);
                        if (view2D.style.display === 'block' && ctx2D && canvas2D && transformParams) {
                            drawSingleEDMSolutionLine(newSolution, ctx2D, canvas2D, transformParams);
                        }
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const endTime = performance.now();
        console.log(`EDM CAM calculation finished in ${(endTime - startTime).toFixed(2)} ms. Found ${allSolutions.length} solutions.`);
        
        // After loop, visualize all solutions in 3D
        if (allSolutions.length > 0) {
            visualizeEDMSolutionsIn3D();
        }

    } catch (error) {
        console.error("Error during EDM CAM calculation:", error);
        alert("An error occurred during EDM path calculation. See console for details.");
    } finally {
        buttonsToDisableDuringCalc.forEach(btn => { if(btn) btn.disabled = false; });
        if (generatePathsBtn) generatePathsBtn.textContent = originalButtonText;
    }
}

function drawSingleEDMSolutionLine(solution, ctx, canvas, transform) {
    if (!solution || !ctx || !canvas || !transform) return;

    ctx.beginPath();
    const topPtX = solution.topPoint.x * transform.scale + transform.offsetX;
    const topPtY = transform.correctedOffsetY - solution.topPoint.y * transform.scale;
    const bottomPtX = solution.bottomPoint.x * transform.scale + transform.offsetX;
    const bottomPtY = transform.correctedOffsetY - solution.bottomPoint.y * transform.scale;

    ctx.moveTo(topPtX, topPtY);
    ctx.lineTo(bottomPtX, bottomPtY);

    ctx.strokeStyle = '#FFFFFF'; // WHITE color
    ctx.lineWidth = 1.5; 
    ctx.stroke();
}

function drawEDMSolutionLines() {
    if (!ctx2D || !canvas2D || allSolutions.length === 0) {
        // If called when no solutions (e.g. after clear), this is fine, just exits.
        return;
    }
    
    // This function now primarily serves to redraw ALL solutions (e.g., on view switch/resize)
    // It needs to recalculate its own transform parameters or have them passed if we change architecture.
    // For now, it recalculates, similar to how calculateAndVisualizeEDMPaths sets up its initial transformParams.
    let currentTransformParams = null;
    const allPerimPoints = [];
    ['top', 'mid', 'bottom'].forEach(type => {
        processedPerimeters[type].forEach(path => {
            path.forEach(point => allPerimPoints.push(point));
        });
    });

    if (allPerimPoints.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        allPerimPoints.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const padding = 20;
        const availableWidth = canvas2D.width - 2 * padding;
        const availableHeight = canvas2D.height - 2 * padding;
        const dataWidth = maxX - minX; const dataHeight = maxY - minY;
        let scale;
        if (dataWidth === 0 && dataHeight === 0) scale = 1;
        else if (dataWidth === 0) scale = availableHeight / (dataHeight || 1);
        else if (dataHeight === 0) scale = availableWidth / (dataWidth || 1);
        else scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
        currentTransformParams = {
            scale: scale,
            offsetX: padding + (availableWidth - dataWidth * scale) / 2 - minX * scale,
            correctedOffsetY: padding + (availableHeight - dataHeight * scale) / 2 + maxY * scale
        };
    } else if (allSolutions.length > 0) { // Fallback if no perimeters but solutions exist
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        allSolutions.forEach(sol => {
            minX = Math.min(minX, sol.topPoint.x, sol.bottomPoint.x);
            maxX = Math.max(maxX, sol.topPoint.x, sol.bottomPoint.x);
            minY = Math.min(minY, sol.topPoint.y, sol.bottomPoint.y);
            maxY = Math.max(maxY, sol.topPoint.y, sol.bottomPoint.y);
        });
        if(minX !== Infinity){
            const padding = 20;
            const availableWidth = canvas2D.width - 2 * padding;
            const availableHeight = canvas2D.height - 2 * padding;
            const dataWidth = maxX - minX; const dataHeight = maxY - minY;
            let scale;
            if (dataWidth === 0 && dataHeight === 0) scale = 1;
            else if (dataWidth === 0) scale = availableHeight / (dataHeight || 1);
            else if (dataHeight === 0) scale = availableWidth / (dataWidth || 1);
            else scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
            currentTransformParams = {
                scale: scale,
                offsetX: padding + (availableWidth - dataWidth * scale) / 2 - minX * scale,
                correctedOffsetY: padding + (availableHeight - dataHeight * scale) / 2 + maxY * scale
            };
        }
    }

    if (!currentTransformParams) {
        // console.log("drawEDMSolutionLines: No transform parameters, cannot draw.");
        return; // Cannot draw without transform parameters
    }
    
    // Draw all solutions using the just-calculated or fallback transform
    allSolutions.forEach(solution => {
        // Call the single line drawing function for each
        drawSingleEDMSolutionLine(solution, ctx2D, canvas2D, currentTransformParams);
    });
}

function handleDownloadEDMResults() {
    if (allSolutions.length === 0) {
        alert("No EDM CAM results to download. Please generate paths first.");
        return;
    }
    let content = "TOP\n";
    allSolutions.forEach(sol => {
        content += `${sol.bottomPoint.x.toFixed(4)} ${sol.bottomPoint.y.toFixed(4)} ${sol.topPoint.x.toFixed(4)} ${sol.topPoint.y.toFixed(4)}\n`;
    });
    content += "BOTTOM\n";
    allSolutions.forEach(sol => {
        content += `${sol.bottomPoint.x.toFixed(4)} ${sol.bottomPoint.y.toFixed(4)} ${sol.topPoint.x.toFixed(4)} ${sol.topPoint.y.toFixed(4)}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edm_cam_results.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("EDM CAM results download initiated.");
}

function visualizeEDMSolutionsIn3D() {
    if (!solutionVizGroup || !currentObject || !currentObject.geometry) {
        console.warn("Cannot visualize 3D EDM solutions: Missing group or current object.");
        return;
    }
    solutionVizGroup.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    solutionVizGroup.clear();
    if (allSolutions.length === 0) return;
    let worldTopZ, worldBottomZ;
    if (processedPerimeters.top.length > 0 && processedPerimeters.top[0].length > 0) {
        worldTopZ = processedPerimeters.top[0][0].z;
    } else {
        console.warn("Cannot determine worldTopZ for 3D EDM solutions. Top perimeter missing. Using currentObject bounds.");
        const box = new THREE.Box3().setFromObject(currentObject);
        worldTopZ = box.max.z; 
    }
    if (processedPerimeters.bottom.length > 0 && processedPerimeters.bottom[0].length > 0) {
        worldBottomZ = processedPerimeters.bottom[0][0].z;
    } else {
        console.warn("Cannot determine worldBottomZ for 3D EDM solutions. Bottom perimeter missing. Using currentObject bounds.");
        const box = new THREE.Box3().setFromObject(currentObject);
        worldBottomZ = box.min.z;
    }
    if (!currentObject.geometry.boundingSphere) currentObject.geometry.computeBoundingSphere();
    const pipeRadius = currentObject.geometry.boundingSphere ? Math.max(0.005, currentObject.geometry.boundingSphere.radius * 0.0075) : 0.01;
    const tubularSegments = 8; 
    const radialSegments = 6;

    // Modified material for brighter white pipes
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff, 
        emissive: 0x222222, // Add a slight emissive component for brightness
        side: THREE.DoubleSide 
    });

    allSolutions.forEach(solution => {
        const startVec = new THREE.Vector3(solution.topPoint.x, solution.topPoint.y, worldTopZ);
        const endVec = new THREE.Vector3(solution.bottomPoint.x, solution.bottomPoint.y, worldBottomZ);
        if (startVec.distanceToSquared(endVec) < 0.0001) return;
        const curve = new THREE.LineCurve3(startVec, endVec);
        const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, pipeRadius, radialSegments, false);
        const tubeMesh = new THREE.Mesh(tubeGeometry, material.clone()); 
        solutionVizGroup.add(tubeMesh);
    });
    console.log(`Added ${solutionVizGroup.children.length} EDM solution pipes to 3D view.`);
}

