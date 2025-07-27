import * as THREE_VIEWER from './three-viewer.js';
import { topPerimeter, bottomPerimeter, middlePerimeter } from './three-viewer.js';
import { generateCornerSolutions } from './CAM.js';

let cornerSolutions = [];

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
    const { 
        topPerimeter, 
        upperQuarterPerimeter, 
        middlePerimeter, 
        lowerQuarterPerimeter, 
        bottomPerimeter 
    } = THREE_VIEWER;

    if ([topPerimeter, upperQuarterPerimeter, middlePerimeter, lowerQuarterPerimeter, bottomPerimeter].every(p => p.length === 0)) {
        alert('No perimeters calculated. Use the "Select Top Face" tool first.');
        return;
    }

    const formatSection = (name, perimeters) => {
        const header = name;
        if (!perimeters || perimeters.length === 0) {
            return `${header}\n`;
        }
        // Flatten all points from all polylines into a single list of "x,y" strings
        const pointsString = perimeters
            .map(polyline => 
                polyline.map(point => `${point[0].toFixed(6)},${point[1].toFixed(6)}`).join('\n')
            )
            .join('\n'); // Join points from different polylines in the same section
        return `${header}\n${pointsString}`;
    };

    let fileContent = [
        formatSection('TOP', THREE_VIEWER.topPerimeter),
        formatSection('UPPER', THREE_VIEWER.upperQuarterPerimeter),
        formatSection('MIDDLE', THREE_VIEWER.middlePerimeter),
        formatSection('LOWER', THREE_VIEWER.lowerQuarterPerimeter),
        formatSection('BOTTOM', THREE_VIEWER.bottomPerimeter)
    ].join('\n\n');

    if (cornerSolutions.length > 0) {
        fileContent += '\n\n\n--- CORNER SOLUTIONS ---\n';
        cornerSolutions.forEach(sol => {
            fileContent += `\n\nMIDDLE_VERTEX_INDEX: ${sol.middleVertexIndex}\n`;
            if (sol.solutionLine) {
                const { startPoint, endPoint } = sol.solutionLine;
                fileContent += `SOLUTION_LINE:\n`;
                fileContent += `  start: ${startPoint.x.toFixed(6)}, ${startPoint.y.toFixed(6)}, ${startPoint.z.toFixed(6)}\n`;
                fileContent += `  end:   ${endPoint.x.toFixed(6)}, ${endPoint.y.toFixed(6)}, ${endPoint.z.toFixed(6)}\n`;
            }
        });
    }

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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    THREE_VIEWER.init(); // Initialize the 3D viewer
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
            cornerSolutions = []; // Clear old solutions
            THREE_VIEWER.loadSTL(file);
        }
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
        cornerSolutions = generateCornerSolutions(THREE_VIEWER, angleThreshold);
        THREE_VIEWER.drawCAMSolutions(cornerSolutions); // Visualize solutions
        if(cornerSolutions.length > 0) {
            alert(`Found and processed ${cornerSolutions.length} sharp corners.`);
        } else {
            alert('No solutions found for the given parameters.');
        }
    });
}); 