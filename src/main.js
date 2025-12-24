import * as THREE_VIEWER from './three-viewer.js';
// import { calculateSyncSolutions } from './CAM.js';
// import { generateGCode } from './GCODE.js';
// import * as SIMULATOR from './Simulate.js';

let camSolutions = {
    solutionLines: [],
    modifiedTopPerimeter: null,
    modifiedBottomPerimeter: null,
    syncPairs: []
};

// View switching logic
const view3dPanel = document.getElementById('view-3d');
// const view2dPanel = document.getElementById('view-2d');
const gcodeEditorPanel = document.getElementById('gcode-editor');

const viewModeButtons = {
    '3D': document.getElementById('mode-3d-btn'),
    '2D': document.getElementById('mode-2d-btn'),
    'G-Code': document.getElementById('mode-gcode-btn')
};

const viewPanels = {
    '3D': view3dPanel,
    '2D': view3dPanel, // Both 2D and 3D modes use the same panel
    'G-Code': gcodeEditorPanel
};

function setActiveView(viewName) {
    // Hide all panels and deactivate all buttons
    Object.values(viewPanels).forEach(p => p.style.display = 'none');
    Object.values(viewModeButtons).forEach(b => b.classList.remove('active'));

    // Show the selected panel and activate the corresponding button
    if (viewPanels[viewName] && viewModeButtons[viewName]) {
        viewPanels[viewName].style.display = 'block';
        viewModeButtons[viewName].classList.add('active');
        
        if (viewName === '2D') {
            THREE_VIEWER.setCameraView('2D');
        } else if (viewName === '3D') {
            THREE_VIEWER.setCameraView('3D');
        }
    }
}

// Event Listeners for view mode buttons
viewModeButtons['3D'].addEventListener('click', () => setActiveView('3D'));
viewModeButtons['2D'].addEventListener('click', () => setActiveView('2D'));
viewModeButtons['G-Code'].addEventListener('click', () => setActiveView('G-Code'));

// Toggle button logic
function setupToggleButtons() {
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(button => {
        // Set initial state based on HTML class
        const isActive = button.classList.contains('active');
        updateToggleState(button, isActive);

        button.addEventListener('click', () => {
            const newState = !button.classList.contains('active');
            updateToggleState(button, newState);
            
            // Connect to Three.js viewer
            if (button.id === 'toggle-mesh-btn') {
                THREE_VIEWER.toggleMeshVisibility(newState);
            } else if (button.id === 'toggle-mesh-lines-btn') {
                THREE_VIEWER.toggleWireframeVisibility(newState);
            } else if (button.id === 'toggle-perimeters-btn') {
                THREE_VIEWER.togglePerimetersVisibility(newState);
            } else if (button.id === 'toggle-rulings-btn') {
                THREE_VIEWER.toggleRulingsVisibility(newState);
            } else if (button.id === 'toggle-stitches-btn') {
                THREE_VIEWER.toggleStitchesVisibility(newState);
            } else if (button.id === 'toggle-kerfs-btn') {
                THREE_VIEWER.toggleKerfsVisibility(newState);
            } else if (button.id === 'toggle-gadget-btn') {
                THREE_VIEWER.toggleGadgetVisibility(newState);
            }
        });
    });
}

function updateToggleState(button, isActive) {
    if (isActive) {
        button.classList.add('active');
    } else {
        button.classList.remove('active');
    }
}

// Selection button logic
const selectionButtons = {};

function setupSelectionButtons() {
    selectionButtons.selectFaceBtn = document.getElementById('select-top-face-btn');
    selectionButtons.selectOriginBtn = document.getElementById('select-origin-btn');
    selectionButtons.selectLeadInBtn = document.getElementById('select-lead-in-btn');
    selectionButtons.selectManualRulingsBtn = document.getElementById('select-manual-rulings-btn');

    const deactivateAllHighlights = () => {
        Object.values(selectionButtons).forEach(btn => btn.classList.remove('selection-active'));
    };

    const setupButton = (button, action) => {
        button.addEventListener('click', () => {
            deactivateAllHighlights();
            button.classList.add('selection-active');
            action();
        });
    };

    setupButton(selectionButtons.selectFaceBtn, () => THREE_VIEWER.toggleFaceSelectionMode(true));
    setupButton(selectionButtons.selectOriginBtn, () => THREE_VIEWER.toggleVertexSelectionMode(true, 'origin'));
    setupButton(selectionButtons.selectLeadInBtn, () => THREE_VIEWER.toggleVertexSelectionMode(true, 'lead-in'));
    setupButton(selectionButtons.selectManualRulingsBtn, () => THREE_VIEWER.toggleVertexSelectionMode(true, 'manual-ruling'));

    document.addEventListener('selectionCompleted', () => {
        deactivateAllHighlights();
        // setActiveView('2D'); // Optional: switch view after selection
    }, false);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            THREE_VIEWER.deactivateAllModes();
            deactivateAllHighlights();
        }
    });
}

async function loadSTLFromURL(url, filename) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch STL: ${response.statusText}`);
        }
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'application/vnd.ms-pki.stl' });
        camSolutions = { solutionLines: [], modifiedTopPerimeter: null, modifiedBottomPerimeter: null, syncPairs: [] };
        THREE_VIEWER.loadSTL(file);
    } catch (error) {
        console.error('Error loading STL from URL:', error);
        alert(`Could not load test case from ${url}. See console for details.`);
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    THREE_VIEWER.init(); // Initialize the 3D viewer
    // SIMULATOR.setupSimulator(THREE_VIEWER.updateWireGuides);
    setActiveView('3D'); // Set initial view
    setupToggleButtons(); // Initialize toggle buttons
    setupSelectionButtons(); // Initialize selection buttons

    // STL Loader
    const stlFileInput = document.getElementById('stl-file-input');
    const loadStlBtn = document.getElementById('load-stl-btn');
    loadStlBtn.addEventListener('click', () => {
        stlFileInput.click();
    });
    stlFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            camSolutions = { solutionLines: [], modifiedTopPerimeter: null, modifiedBottomPerimeter: null, syncPairs: [] };
            THREE_VIEWER.loadSTL(file);
        }
    });

    // Test case loaders
    document.getElementById('load-gear-btn').addEventListener('click', () => {
        loadSTLFromURL('/gear.stl', 'gear.stl');
    });
    document.getElementById('load-loft-btn').addEventListener('click', () => {
        loadSTLFromURL('/loft.stl', 'loft.stl');
    });

    // --- Clipboard copy for polylines ---
    function formatPolylineForDesmos(polyline) {
        if (!polyline || polyline.length === 0) return '';
        // Assuming the first polyline in the array is the one we want
        const points = polyline[0];
        return points.map(p => `${p[0].toFixed(8)}\t${p[1].toFixed(8)}`).join('\n');
    }

    function copyPolyline(perimeterKey) {
        if (!THREE_VIEWER.currentPerimeters) {
            alert("No perimeters calculated yet. Please load a model first.");
            return;
        }
        const polyline = THREE_VIEWER.currentPerimeters[perimeterKey];
        if (!polyline) {
            alert(`Perimeter ${perimeterKey} not found.`);
            return;
        }
        const textToCopy = formatPolylineForDesmos(polyline);
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(`${perimeterKey} copied to clipboard!`);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert(`Failed to copy ${perimeterKey}. See console for details.`);
        });
    }

    document.getElementById('copy-p0-btn').addEventListener('click', () => copyPolyline('P0'));
    document.getElementById('copy-p1-btn').addEventListener('click', () => copyPolyline('P1'));

    const prepareSurfaceBtn = document.getElementById('prepare-surface-btn');
    prepareSurfaceBtn.addEventListener('click', () => {
        THREE_VIEWER.prepareSurface();
    });
    
    const generateBtn = document.getElementById('generate-paths-btn');
    generateBtn.addEventListener('click', () => {
        THREE_VIEWER.calculateAndDrawKerf();
    });


    /*
    // Simulation controls
    const playPauseBtn = document.getElementById('sim-play-pause-btn');
    playPauseBtn.addEventListener('click', () => {
        const { isPlaying, simulationFinished } = SIMULATOR.togglePlayPause();
        if (simulationFinished) {
            playPauseBtn.textContent = 'Replay';
        } else {
            playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
        }
    });

    const speedInput = document.getElementById('sim-speed-input');
    speedInput.addEventListener('change', () => {
        const speed = parseInt(speedInput.value, 10);
        if (!isNaN(speed)) {
            SIMULATOR.setSpeed(speed);
        }
    });
    */
}); 