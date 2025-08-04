import * as THREE_VIEWER from './three-viewer.js';
import { topPerimeter, bottomPerimeter, middlePerimeter } from './three-viewer.js';
import { calculateSyncSolutions } from './CAM.js';
import { generateGCode } from './GCODE.js';
import * as SIMULATOR from './Simulate.js';

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
            } else if (button.id === 'toggle-endpoints-btn') {
                THREE_VIEWER.toggleEndpointsVisibility(newState);
            } else if (button.id === 'toggle-solutions-btn') {
                THREE_VIEWER.toggleSolutionsVisibility(newState);
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
function setupSelectionButtons() {
    const selectFaceBtn = document.getElementById('select-top-face-btn');
    selectFaceBtn.addEventListener('click', () => {
        THREE_VIEWER.toggleFaceSelectionMode(true);
    });

    // Custom event listener for when selection is done
    document.addEventListener('selectionCompleted', () => {
        // Automatically switch to 2D view after selection -- REMOVED
        // setActiveView('2D'); 
    }, false);
}

/**
 * Formats and triggers a download of the calculated perimeters.
 */
function downloadPerimetersAsText() {
    const { modifiedTopPerimeter, modifiedBottomPerimeter, syncPairs } = camSolutions;

    const top = modifiedTopPerimeter || THREE_VIEWER.topPerimeter;
    const bottom = modifiedBottomPerimeter || THREE_VIEWER.bottomPerimeter;

    if (top.length === 0 || bottom.length === 0) {
        alert('No perimeters calculated. Use the "Select Top Face" tool first.');
        return;
    }

    // 1. Format Top Perimeter
    const formatPolyline = (name, polyline) => {
        if (!polyline || polyline.length === 0 || polyline[0].length === 0) {
            return `${name}\n`;
        }
        const pointsString = polyline[0].map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`).join('\n');
        return `${name}\n${pointsString}`;
    };

    // 2. Format Sync Pairs
    const formatSyncPairs = (pairs) => {
        if (!pairs || pairs.length === 0) {
            return "SYNC_PAIRS\n";
        }
        const pairsString = pairs.map(pair => `${pair[0]},${pair[1]}`).join('\n');
        return `SYNC_PAIRS\n${pairsString}`;
    };

    const fileContent = [
        formatPolyline('TOP_PERIMETER', top),
        formatPolyline('BOTTOM_PERIMETER', bottom),
        formatSyncPairs(syncPairs)
    ].join('\n\n');

    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'polylines.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    SIMULATOR.setupSimulator(THREE_VIEWER.updateWireGuides);
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

    // Perimeter download listener
    const downloadBtn = document.getElementById('download-polylines-btn');
    downloadBtn.addEventListener('click', downloadPerimetersAsText);

    // Generate G-Code listener
    const generateBtn = document.getElementById('generate-paths-btn');
    generateBtn.addEventListener('click', () => {
        const angleThreshold = parseFloat(document.getElementById('corner-angle-threshold').value);
        if (isNaN(angleThreshold)) {
            alert('Invalid angle threshold.');
            return;
        }
        camSolutions = calculateSyncSolutions(THREE_VIEWER, angleThreshold);
        THREE_VIEWER.drawCAMSolutions(camSolutions); // Visualize solutions

        const { modifiedTopPerimeter, modifiedBottomPerimeter, syncPairs } = camSolutions;
        const gcode = generateGCode(modifiedTopPerimeter, modifiedBottomPerimeter, syncPairs);
        document.getElementById('gcode-output').value = gcode;

        if (gcode) {
            const topZ = modifiedTopPerimeter[0][0][2]; // Get Z from the first point of the top perimeter
            const bottomZ = modifiedBottomPerimeter[0][0][2]; // Get Z from the first point of the bottom perimeter
            SIMULATOR.loadGCode(gcode, topZ, bottomZ);
        }
    });

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
}); 