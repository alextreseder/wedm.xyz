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
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.stl';

const viewTitle = document.getElementById('view-title');

const allViews = [view3DContainer, view2D, gcodeEditor];
const allModeBtns = [mode3DBtn, mode2DBtn, modeGCodeBtn];

let scene, camera, renderer, controls, stlLoader; // fontLoader removed
let currentObject = null;
let axesGroup = new THREE.Group();

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

function loadSTLFromFilePath(filePath) {
    if (!stlLoader || !scene) {
        console.error("STL Loader or scene not initialized.");
        return;
    }

    stlLoader.load(filePath, 
        (geometry) => { // onLoad callback
            geometry.center();
            if (currentObject) {
                scene.remove(currentObject);
                currentObject.geometry.dispose();
                currentObject.material.dispose();
            }
            const material = new THREE.MeshPhongMaterial({
                color: 0xcccccc,
                shininess: 50,
                specular: 0x111111
            });
            currentObject = new THREE.Mesh(geometry, material);
            scene.add(currentObject);

            const wireframeGeo = new THREE.WireframeGeometry(geometry);
            const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 0.5, transparent: true, opacity: 0.25 });
            const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
            currentObject.add(wireframe);

            const boundingBox = new THREE.Box3().setFromObject(currentObject);
            const center = boundingBox.getCenter(new THREE.Vector3());
            const sizeVec = boundingBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);

            controls.target.copy(center);
            camera.position.copy(center).add(new THREE.Vector3(maxDim * 0.75, maxDim * 0.75, maxDim * 1.5));
            camera.lookAt(center);
            controls.update();
            createAxes(maxDim * 0.75);
        },
        (xhr) => { // onProgress callback (optional)
            // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (error) => { // onError callback
            console.error('Error loading STL from path:', error);
            alert(`Error loading STL file: ${filePath}`);
        }
    );
}

function loadSTL(file) {
    if (!stlLoader) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const geometry = stlLoader.parse(event.target.result);
            geometry.center();

            if (currentObject) {
                scene.remove(currentObject);
                currentObject.geometry.dispose();
                currentObject.material.dispose();
            }

            const material = new THREE.MeshPhongMaterial({
                color: 0xcccccc,
                shininess: 50,
                specular: 0x111111
            });
            currentObject = new THREE.Mesh(geometry, material);
            scene.add(currentObject);

            const wireframeGeo = new THREE.WireframeGeometry(geometry);
            const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 0.5, transparent: true, opacity: 0.25 });
            const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
            currentObject.add(wireframe);

            const boundingBox = new THREE.Box3().setFromObject(currentObject);
            const center = boundingBox.getCenter(new THREE.Vector3());
            const sizeVec = boundingBox.getSize(new THREE.Vector3()); // Renamed from 'size' to avoid conflict with createAxes param
            const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);

            controls.target.copy(center);
            camera.position.copy(center).add(new THREE.Vector3(maxDim * 0.75, maxDim * 0.75, maxDim * 1.5));
            camera.lookAt(center);
            controls.update();

            // Scale axes (font parameter removed from call)
            createAxes(maxDim * 0.75);

        } catch (error) {
            console.error('Error parsing STL:', error);
            alert('Error loading or parsing STL file.');
        }
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
    loadGearBtn.addEventListener('click', () => loadSTLFromFilePath('/gear.stl'));
}
if (loadLoftBtn) {
    loadLoftBtn.addEventListener('click', () => loadSTLFromFilePath('/loft.stl'));
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
