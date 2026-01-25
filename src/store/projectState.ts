/**
 * ProjectState Structure
 * 
 * This file defines the "Single Source of Truth" for the application.
 * It separates User Inputs (Params), Exact Geometry (BREP), 
 * Visuals (MESH), Manufacturing Logic (CAM), and Output (GCODE).
 */

export interface ProjectState {
    /** 
     * Metadata: High-level project information 
     */
    metadata: {
        projectName: string;        // Name of the project/file
        lastModified: number;       // Timestamp
        appVersion: string;         // e.g., "0V01"
    };

    /**
     * PARAMS: User-configurable settings.
     * This section is the primary data source for the Config Window (Tweakpane).
     * Changing these values triggers updates in the application (re-calculation, re-rendering).
     */
    params: {
        units: {
            system: 'mm' | 'in';     // Current display units
            scaleFactor: number;     // Multiplier to convert to internal mm (1.0 or 25.4)
        };
        cam: {
            wireTension: number;     // Wire tension in Newtons (1-30)
            wireSpeed: number;       // Wire run speed in mm/s (1-100)
            kerfDiameter: number;    // Diameter of the cut width in mm
            numberOfPasses: number;  // Number of cut passes (1-5)
            tolerance: number;       // Max deviation for tessellation/toolpath in mm (0.001-0.05)
            upperGuideZ: number;     // Z-height of the upper wire guide in mm
            lowerGuideZ: number;     // Z-height of the lower wire guide in mm
        };
        spark: {
            // Temporal Parameters (Time-based)
            pulseOnTime: number;     // Duration of discharge in µs
            pulseOffTime: number;    // Duration of pause in µs
            dutyCycle: number;       // Calculated percentage of on-time
            frequency: number;       // Calculated frequency in kHz
            
            // Magnitude Parameters (Voltage/Current)
            peakCurrent: number;     // Max current in Amps
            servoVoltage: number;    // Target gap voltage in Volts
            peakVoltage: number;     // Open circuit voltage in Volts
            polarity: 'positive' | 'negative'; // Electrode polarity
        };
        cost: {
            materialCost: number;    // Cost per kg of material
            machineRate: number;     // Hourly cost of machine operation
        };
        kernel: {
            meshResolution: number;  // Linear deflection for tessellation (0.01 - 1.0)
            debugMode: boolean;      // Toggle for developer visualizations
        };
        drill: {
            diameter: number;        // Hole start hole diameter
            depth: number;           // Drill depth
            peck: boolean;           // Use peck drilling cycle?
        };
    };

    /**
     * BREP: Boundary Representation (CAD Kernel Data).
     * Represents the exact mathematical geometry processed by OpenCascade.
     * 
     * NOTE: Actual OCCT shapes are heavy and live in the Web Worker / WASM memory.
     * This section stores lighter metadata, IDs, and references used to 
     * communicate about the geometry without copying the massive objects.
     */
    brep: {
        loadedFileName: string | null; // The original filename
        isValid: boolean;              // Is the model valid for processing?
        
        // Geometric Statistics
        stats: {
            numSolids: number;
            numFaces: number;
            numEdges: number;
            numVertices: number;
        };

        // Detected Features (References/IDs for the Kernel)
        // These are determined by the "Detect Wall Shell" or "Auto Orient" functions
        features: {
            topPlaneId: number | null;    // ID of the face designated as Top
            bottomPlaneId: number | null; // ID of the face designated as Bottom
            walls: number[];              // Array of face IDs identified as vertical walls
        };
    };

    /**
     * MESH: Visual Representation.
     * Settings for how the data is displayed in the Three.js scene.
     * Separating this from BREP prevents visual tweaks from affecting manufacturing accuracy.
     */
    mesh: {
        showWireframe: boolean;
        showSolid: boolean;
        showAxes: boolean;
        showGrid: boolean;
        opacity: number;           // Transparency of the model
        materialColor: string;     // Hex color code
    };

    /**
     * CAM: Computer Aided Manufacturing logic.
     * Holds the specific operations and the resulting calculated toolpaths.
     */
    cam: {
        // List of operations to perform (e.g., "Cut External Profile", "Cut Internal Hole")
        operations: Array<{
            id: string;
            type: '2axis' | '4axis' | 'drill';
            enabled: boolean;
            status: 'pending' | 'calculated' | 'error';
        }>;

        // The result of the "Solve CAM" button
        toolpath: {
            isValid: boolean;
            totalLength: number;    // Total travel distance
            estimatedTime: number;  // Estimated machining time in seconds
            
            // The raw points for the machine to follow
            segments: Array<{
                type: 'rapid' | 'feed';
                points: Array<{x: number, y: number, z: number}>;
            }>;
        };
    };

    /**
     * GCODE: Final Machine Instructions.
     * The text that will be saved to the .NC or .GCODE file.
     */
    gcode: {
        text: string;           // The generated G-Code content
        lineCount: number;      // Number of lines
        lastGenerated: number;  // Timestamp
        warnings: string[];     // Warnings generated during post-processing
    };
}

/**
 * Initial State
 * The default values for the application on load.
 */
export const initialProjectState: ProjectState = {
    metadata: {
        projectName: 'Untitled',
        lastModified: Date.now(),
        appVersion: '0V01'
    },
    params: {
        units: {
            system: 'mm',
            scaleFactor: 1.0
        },
        cam: {
            wireTension: 15,
            wireSpeed: 50,
            kerfDiameter: 0.25,
            numberOfPasses: 1,
            tolerance: 0.01,
            upperGuideZ: 100,
            lowerGuideZ: 0
        },
        spark: {
            pulseOnTime: 10,
            pulseOffTime: 10,
            dutyCycle: 50,
            frequency: 50,
            peakCurrent: 5,
            servoVoltage: 25,
            peakVoltage: 80,
            polarity: 'positive'
        },
        cost: {
            materialCost: 50,
            machineRate: 30
        },
        kernel: {
            meshResolution: 1.0,
            debugMode: false
        },
        drill: {
            diameter: 3.0,
            depth: 10.0,
            peck: true
        }
    },
    brep: {
        loadedFileName: null,
        isValid: false,
        stats: {
            numSolids: 0,
            numFaces: 0,
            numEdges: 0,
            numVertices: 0
        },
        features: {
            topPlaneId: null,
            bottomPlaneId: null,
            walls: []
        }
    },
    mesh: {
        showWireframe: false,
        showSolid: true,
        showAxes: true,
        showGrid: true,
        opacity: 1.0,
        materialColor: '#f5f5f5' // Matches current matcap base
    },
    cam: {
        operations: [],
        toolpath: {
            isValid: false,
            totalLength: 0,
            estimatedTime: 0,
            segments: []
        }
    },
    gcode: {
        text: '',
        lineCount: 0,
        lastGenerated: 0,
        warnings: []
    }
};
