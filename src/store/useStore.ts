import { create } from 'zustand';
import { initialProjectState } from './projectState';
import type { ProjectState } from './projectState';

/**
 * Hovered Entity Type
 * Represents what the user is currently hovering over (transient UI state)
 */
export interface HoveredEntity {
    type: 'face' | 'edge' | 'vertex';
    id: number;
}

interface ProjectStore extends ProjectState {
    // =========================================================================
    // TRANSIENT UI STATE (not serialized to ProjectState JSON)
    // =========================================================================
    
    /** Currently hovered entity (changes on mouse move, not persisted) */
    hoveredEntity: HoveredEntity | null;

    // =========================================================================
    // ACTIONS
    // =========================================================================
    // These are the "Backend Functions" - the ONLY way to modify the state.
    
    // --- Generic Setters ---
    setMetadata: (metadata: Partial<ProjectState['metadata']>) => void;
    
    // --- Param Setters ---
    setCamParam: (key: keyof ProjectState['params']['cam'], value: number | string) => void;
    setSparkParam: (key: keyof ProjectState['params']['spark'], value: number | string) => void;
    setCostParam: (key: keyof ProjectState['params']['cost'], value: number) => void;
    setKernelParam: (key: keyof ProjectState['params']['kernel'], value: number | boolean) => void;
    setDrillParam: (key: keyof ProjectState['params']['drill'], value: number | boolean) => void;

    // --- Unit & Utility Actions ---
    setUnitSystem: (system: 'mm' | 'in') => void;
    scaleParams: (factor: number) => void;
    
    // --- Logic Actions ---
    updateTemporalParams: (changedKey: 'on' | 'off' | 'duty' | 'freq') => void;

    // --- G-Code Actions ---
    setGCodeText: (text: string) => void;

    // --- Selection Actions ---
    /** Set the currently hovered entity (transient, for visual feedback) */
    setHoveredEntity: (entity: HoveredEntity | null) => void;
    
    /** Toggle a face in the selection (add if not present, remove if present) */
    toggleFaceSelection: (faceId: number) => void;
    
    /** Toggle an edge in the selection */
    toggleEdgeSelection: (edgeId: number) => void;
    
    /** Toggle a vertex in the selection */
    toggleVertexSelection: (vertexId: number) => void;
    
    /** Clear all selections */
    clearSelection: () => void;
    
    /** Clear selection of a specific type */
    clearSelectionType: (type: 'face' | 'edge' | 'vertex') => void;
    
    /** Enable/disable selection of a specific entity type */
    setSelectionEnabled: (type: 'face' | 'edge' | 'vertex', enabled: boolean) => void;
    
    /** Set the proximity threshold for edge/vertex detection */
    setProximityThreshold: (type: 'edge' | 'vertex', pixels: number) => void;
}

export const useStore = create<ProjectStore>((set, get) => ({
    ...initialProjectState,

    // Transient state initialization
    hoveredEntity: null,

    // =========================================================================
    // ACTIONS
    // =========================================================================

    setMetadata: (newMetadata) => set((state) => ({
        metadata: { ...state.metadata, ...newMetadata }
    })),

    setCamParam: (key, value) => set((state) => ({
        params: {
            ...state.params,
            cam: { ...state.params.cam, [key]: value } as any
        }
    })),

    setSparkParam: (key, value) => set((state) => ({
        params: {
            ...state.params,
            spark: { ...state.params.spark, [key]: value } as any
        }
    })),

    setCostParam: (key, value) => set((state) => ({
        params: {
            ...state.params,
            cost: { ...state.params.cost, [key]: value }
        }
    })),

    setKernelParam: (key, value) => set((state) => ({
        params: {
            ...state.params,
            kernel: { ...state.params.kernel, [key]: value } as any
        }
    })),

    setDrillParam: (key, value) => set((state) => ({
        params: {
            ...state.params,
            drill: { ...state.params.drill, [key]: value } as any
        }
    })),

    setUnitSystem: (system) => set((state) => ({
        params: {
            ...state.params,
            units: { ...state.params.units, system }
        }
    })),

    scaleParams: (factor) => set((state) => {
        // Scale appropriate distance/speed parameters
        const newCam = { ...state.params.cam };
        newCam.wireSpeed *= factor;
        newCam.kerfDiameter *= factor;
        newCam.tolerance *= factor;
        newCam.upperGuideZ *= factor;
        newCam.lowerGuideZ *= factor;

        const newDrill = { ...state.params.drill };
        newDrill.diameter *= factor;
        newDrill.depth *= factor;

        return {
            params: {
                ...state.params,
                cam: newCam,
                drill: newDrill
            }
        };
    }),

    updateTemporalParams: (changedKey) => {
        // Just reading current values, destructuring unused vars warning fix
        const currentSpark = get().params.spark;
        let newSpark = { ...currentSpark };

        if (changedKey === 'on' || changedKey === 'off') {
            // Update Duty and Freq based on On/Off
            const period = newSpark.pulseOnTime + newSpark.pulseOffTime;
            if (period > 0) {
                newSpark.dutyCycle = (newSpark.pulseOnTime / period) * 100;
                newSpark.frequency = 1000 / period; 
            }
        } else if (changedKey === 'freq' || changedKey === 'duty') {
            // Update On/Off based on Freq and Duty
            if (newSpark.frequency > 0) {
                const period = 1000 / newSpark.frequency;
                newSpark.pulseOnTime = (newSpark.dutyCycle / 100) * period;
                newSpark.pulseOffTime = period - newSpark.pulseOnTime;
            }
        }
        
        set((state) => ({
            params: { ...state.params, spark: newSpark }
        }));
    },

    setGCodeText: (text) => set((state) => ({
        gcode: { 
            ...state.gcode, 
            text,
            lineCount: text.split('\n').length,
            lastGenerated: Date.now()
        }
    })),

    // =========================================================================
    // SELECTION ACTIONS
    // =========================================================================

    setHoveredEntity: (entity) => set({ hoveredEntity: entity }),

    toggleFaceSelection: (faceId) => set((state) => {
        const currentFaces = state.brep.selection.faces;
        const index = currentFaces.indexOf(faceId);
        const newFaces = index === -1 
            ? [...currentFaces, faceId]  // Add
            : currentFaces.filter(id => id !== faceId);  // Remove
        
        return {
            brep: {
                ...state.brep,
                selection: { ...state.brep.selection, faces: newFaces }
            }
        };
    }),

    toggleEdgeSelection: (edgeId) => set((state) => {
        const currentEdges = state.brep.selection.edges;
        const index = currentEdges.indexOf(edgeId);
        const newEdges = index === -1
            ? [...currentEdges, edgeId]
            : currentEdges.filter(id => id !== edgeId);
        
        return {
            brep: {
                ...state.brep,
                selection: { ...state.brep.selection, edges: newEdges }
            }
        };
    }),

    toggleVertexSelection: (vertexId) => set((state) => {
        const currentVertices = state.brep.selection.vertices;
        const index = currentVertices.indexOf(vertexId);
        const newVertices = index === -1
            ? [...currentVertices, vertexId]
            : currentVertices.filter(id => id !== vertexId);
        
        return {
            brep: {
                ...state.brep,
                selection: { ...state.brep.selection, vertices: newVertices }
            }
        };
    }),

    clearSelection: () => set((state) => ({
        brep: {
            ...state.brep,
            selection: { faces: [], edges: [], vertices: [] }
        }
    })),

    clearSelectionType: (type) => set((state) => {
        const key = type === 'face' ? 'faces' : type === 'edge' ? 'edges' : 'vertices';
        return {
            brep: {
                ...state.brep,
                selection: { ...state.brep.selection, [key]: [] }
            }
        };
    }),

    setSelectionEnabled: (type, enabled) => set((state) => {
        const key = type === 'face' ? 'faceEnabled' 
                  : type === 'edge' ? 'edgeEnabled' 
                  : 'vertexEnabled';
        return {
            mesh: {
                ...state.mesh,
                selection: { ...state.mesh.selection, [key]: enabled }
            }
        };
    }),

    setProximityThreshold: (type, pixels) => set((state) => {
        const key = type === 'edge' ? 'edgeProximityThreshold' : 'vertexProximityThreshold';
        return {
            mesh: {
                ...state.mesh,
                selection: { ...state.mesh.selection, [key]: pixels }
            }
        };
    })
}));
