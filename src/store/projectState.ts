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

        /**
         * Selection State: Currently selected BRep entities.
         * These are confirmed selections (clicked), not hover state.
         * Used as inputs for CAM operations.
         */
        selection: {
            faces: number[];     // Array of selected face IDs
            edges: number[];     // Array of selected edge IDs
            vertices: number[];  // Array of selected vertex IDs
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
        
        /**
         * Visibility Settings: Controls what geometry is displayed
         */
        visibility: {
            faces: boolean;        // Show BRep faces (the solid mesh)
            edges: boolean;        // Show BRep edges (wireframe)
            vertices: boolean;     // Show vertex markers
            tessellation: boolean; // Show mesh triangulation lines
        };
        
        /**
         * Selection Settings: Controls which entity types can be selected
         * and the screen-space proximity thresholds for detection.
         */
        selection: {
            faceEnabled: boolean;              // Can user select faces?
            edgeEnabled: boolean;              // Can user select edges?
            vertexEnabled: boolean;            // Can user select vertices?
            edgeProximityThreshold: number;    // Pixels - distance to detect edge hover
            vertexProximityThreshold: number;  // Pixels - distance to detect vertex hover
        };
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
     * ENVIRONMENT: Global UI and rendering settings.
     * Colors, lighting, and visual theming that span the entire application.
     */
    environment: {
        themePreset: string;             // Active palette preset name (e.g. "Iceberg")
        themeMode: string;               // "Dark" or "Light"
        faceHighlightContrast: number;   // HSV value shift for face hover (0-1, default 0.20)
        palette: {
            dark1: string;
            dark2: string;
            content1: string;
            content2: string;
            content3: string;
            content4: string;
            light1: string;
            light2: string;
            accent1: string;
            accent2: string;
            accent3: string;
            accent4: string;
            accent5: string;
            accent6: string;
            accent7: string;
            accent8: string;
        };
        colors: {
            sceneBackground: string;     // 3D viewport background
            sceneFog: string;            // Distance fog color
            groundPlane: string;         // Ground mesh color
            gridLines: string;           // Ground grid color
            modelMaterial: string;       // Matcap material tint
            modelEdges: string;          // BRep edge wireframe
            modelVertices: string;       // BRep vertex markers
            tessellationLines: string;   // Mesh triangulation overlay
            faceHighlight: string;       // Hovered face color
            edgeHighlight: string;       // Hovered edge color
            vertexHighlight: string;     // Hovered vertex sphere
            hemisphereSky: string;       // Hemisphere light (sky)
            hemisphereGround: string;    // Hemisphere light (ground)
            directionalLight: string;    // Key light color
            gizmoX: string;             // Orientation gizmo X axis
            gizmoY: string;             // Orientation gizmo Y axis
            gizmoZ: string;             // Orientation gizmo Z axis
            consoleBackground: string;   // Console panel background
            consoleText: string;         // Console default text
            consoleError: string;        // Console error text
            consoleWarning: string;      // Console warning text
            gcodeBackground: string;     // G-Code editor background
            gcodeComment: string;        // G-Code comment syntax color
            gcodeG: string;              // G-Code G command color
            gcodeM: string;              // G-Code M command color
            gcodeParameter: string;      // G-Code parameter color
            gcodeLineHighlight: string;  // G-Code active line highlight
            topBarBackground: string;    // Top bar background
            topBarBorder: string;        // Top bar bottom border
            topBarButtonBg: string;      // Top bar button background
            topBarButtonBorder: string;  // Top bar button border
            topBarText: string;          // Top bar text color
            glBackground: string;        // Golden Layout container & splitters
            glContentBackground: string; // GL pane content area
            glTabBackground: string;     // GL inactive tab
            glTabText: string;           // GL inactive tab text
            glTabActiveText: string;     // GL active/hover tab text
            glTabFocusAccent: string;    // GL focused tab accent
            glSplitterHover: string;     // GL splitter on hover
            glWindowBg: string;          // GL window pane background (behind tweakpane etc.)
            simBackground: string;       // Simulation window background
            simText: string;             // Simulation window text
        };
        tweakpane: {
            baseBackground: string;
            baseShadow: string;
            buttonBackground: string;
            buttonBackgroundActive: string;
            buttonBackgroundFocus: string;
            buttonBackgroundHover: string;
            buttonForeground: string;
            containerBackground: string;
            containerBackgroundActive: string;
            containerBackgroundFocus: string;
            containerBackgroundHover: string;
            containerForeground: string;
            grooveForeground: string;
            inputBackground: string;
            inputBackgroundActive: string;
            inputBackgroundFocus: string;
            inputBackgroundHover: string;
            inputForeground: string;
            labelForeground: string;
            monitorBackground: string;
            monitorForeground: string;
        };
    };

    /**
     * LAYOUT: Golden Layout window arrangement.
     * Stores the serialized LayoutConfig so the user's panel arrangement
     * (tab order, splitter positions, stacks) persists across sessions.
     * null means "use the application default layout".
     */
    layout: Record<string, any> | null;

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
        },
        selection: {
            faces: [],
            edges: [],
            vertices: []
        }
    },
    mesh: {
        showWireframe: false,
        showSolid: true,
        showAxes: true,
        showGrid: true,
        opacity: 1.0,
        materialColor: '#f5f5f5', // Matches current matcap base
        visibility: {
            faces: true,       // Show BRep faces (solid mesh) by default
            edges: true,       // Show BRep edges (wireframe) by default
            vertices: false,   // Hide vertex markers by default
            tessellation: false // Hide tessellation lines by default
        },
        selection: {
            faceEnabled: true,
            edgeEnabled: true,
            vertexEnabled: true,
            edgeProximityThreshold: 8,    // pixels
            vertexProximityThreshold: 12  // pixels
        }
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
    environment: {
        themePreset: 'Default',
        themeMode: 'Dark',
        faceHighlightContrast: 0.20,
        palette: {
            dark1: '#111111ff',
            dark2: '#1e1e1eff',
            content1: '#333333ff',
            content2: '#4c4c4cff',
            content3: '#b2b2b2ff',
            content4: '#ccccccff',
            light1: '#e0e0e0ff',
            light2: '#ffffffff',
            accent1: '#f73c3cff',
            accent2: '#ff9d00ff',
            accent3: '#e6e600ff',
            accent4: '#6ccb26ff',
            accent5: '#6cebffff',
            accent6: '#178cf0ff',
            accent7: '#5b6ef5ff',
            accent8: '#c549c9ff',
        },
        colors: {
            sceneBackground: '#1e1e1eff',
            sceneFog: '#1e1e1eff',
            groundPlane: '#111111ff',
            gridLines: '#e0e0e0ff',
            modelMaterial: '#ffffffff',
            modelEdges: '#111111ff',
            modelVertices: '#111111ff',
            tessellationLines: '#b2b2b2ff',
            faceHighlight: '#ccccccff',
            edgeHighlight: '#ffffffff',
            vertexHighlight: '#ffffffff',
            hemisphereSky: '#ffffffff',
            hemisphereGround: '#b2b2b2ff',
            directionalLight: '#e0e0e0ff',
            gizmoX: '#f73c3cff',
            gizmoY: '#6ccb26ff',
            gizmoZ: '#178cf0ff',
            consoleBackground: '#1e1e1eff',
            consoleText: '#e0e0e0ff',
            consoleError: '#f73c3cff',
            consoleWarning: '#6cebffff',
            gcodeBackground: '#1e1e1eff',
            gcodeComment: '#e0e0e0ff',
            gcodeG: '#f73c3cff',
            gcodeM: '#ff9d00ff',
            gcodeParameter: '#e6e600ff',
            gcodeLineHighlight: '#4c4c4cff',
            topBarBackground: '#111111ff',
            topBarBorder: '#b2b2b2ff',
            topBarButtonBg: '#b2b2b2ff',
            topBarButtonBorder: '#b2b2b2ff',
            topBarText: '#ffffffff',
            glBackground: '#111111ff',
            glContentBackground: '#4c4c4cff',
            glTabBackground: '#111111ff',
            glTabText: '#ccccccff',
            glTabActiveText: '#e0e0e0ff',
            glTabFocusAccent: '#178cf0ff',
            glSplitterHover: '#b2b2b2ff',
            glWindowBg: '#1e1e1eff',
            simBackground: '#1e1e1eff',
            simText: '#e0e0e0ff',
        },
        tweakpane: {
            baseBackground: '#1e1e1eff',
            baseShadow: '#11111133',
            buttonBackground: '#e0e0e0ff',
            buttonBackgroundHover: '#e5e5e5ff',
            buttonBackgroundFocus: '#e9e9e9ff',
            buttonBackgroundActive: '#eeeeeeff',
            buttonForeground: '#1e1e1eff',
            containerBackground: '#4c4c4cff',
            containerBackgroundHover: '#666666ff',
            containerBackgroundFocus: '#7f7f7fff',
            containerBackgroundActive: '#999999ff',
            containerForeground: '#e0e0e0ff',
            grooveForeground: '#333333ff',
            inputBackground: '#333333ff',
            inputBackgroundHover: '#393939ff',
            inputBackgroundFocus: '#404040ff',
            inputBackgroundActive: '#464646ff',
            inputForeground: '#e0e0e0ff',
            labelForeground: '#ccccccff',
            monitorBackground: '#333333ff',
            monitorForeground: '#ccccccff',
        }
    },
    layout: {
        root: {
            type: 'row',
            content: [
                {
                    type: 'stack',
                    content: [
                        { type: 'component', size: '1fr', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'Config', componentType: 'config-window', componentState: { label: 'Config' } }
                    ],
                    size: '20%', id: '', maximised: false, isClosable: true, activeItemIndex: 0
                },
                {
                    type: 'column',
                    content: [
                        {
                            type: 'stack',
                            content: [
                                { type: 'component', size: '50%', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'Scene', componentType: 'scene-window', componentState: {} },
                                { type: 'component', size: '1fr', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'Environment', componentType: 'environment-window', componentState: { label: 'Environment' } }
                            ],
                            size: '75%', id: '', maximised: false, isClosable: true, activeItemIndex: 0
                        },
                        {
                            type: 'stack',
                            content: [
                                { type: 'component', size: '1fr', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'Console', componentType: 'console-window', componentState: { label: 'Console' } }
                            ],
                            size: '25%', id: '', maximised: false, isClosable: true, activeItemIndex: 0
                        }
                    ],
                    size: '60%', id: '', isClosable: true
                },
                {
                    type: 'stack',
                    content: [
                        { type: 'component', size: '1fr', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'G-Code', componentType: 'gcode-window', componentState: { label: 'G-Code' } },
                        { type: 'component', size: '1fr', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: 'Simulation', componentType: 'simulation-window', componentState: { label: 'Simulation' } }
                    ],
                    size: '20%', id: '', maximised: false, isClosable: true, activeItemIndex: 0
                }
            ],
            size: '1fr', id: '', isClosable: true
        },
        openPopouts: [],
        settings: { constrainDragToContainer: true, reorderEnabled: true, popoutWholeStack: false, blockedPopoutsThrowError: true, closePopoutsOnUnload: true, responsiveMode: 'none', tabOverlapAllowance: 0, reorderOnTabMenuClick: true, tabControlOffset: 10, popInOnClose: false },
        dimensions: { borderWidth: 5, borderGrabWidth: 5, defaultMinItemHeight: '0px', defaultMinItemWidth: '10px', headerHeight: 20, dragProxyWidth: 300, dragProxyHeight: 200 },
        header: { show: 'top', popout: 'open in new window', dock: 'dock', close: 'close', maximise: 'maximise', minimise: 'minimise', tabDropdown: 'additional tabs' }
    },
    gcode: {
        text: `;==============================
;  Welcome to WEDM.XYZ
;  Version: 0.1
;  Author: Alex Treseder
;  License: MIT
;==============================
;
; ***G-code will appear here***
;
; How to use:
; 1. Import your model
; 2. Check auto-detected
;    orientation & origin
; 3. Set kerf diameter
; 4. Generate cage for
;    wire path
; 5. Add lead-in/lead-out
; 6. Adjust spark settings
; 7. Generate G-Code
; 8. Simulate
;
; Or simply paste any
; G-code to simulate
;
; Happy machining!
;==============================
;     wedm.xyz Wire EDM CAM
;==============================`,
        lineCount: 29,
        lastGenerated: 0,
        warnings: []
    }
};
