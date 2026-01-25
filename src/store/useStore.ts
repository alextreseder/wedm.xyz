import { create } from 'zustand';
import { initialProjectState } from './projectState';
import type { ProjectState } from './projectState';

interface ProjectStore extends ProjectState {
    // Actions
    // These are the "Backend Functions" you asked for.
    // They are the ONLY way to modify the state.
    
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
}

export const useStore = create<ProjectStore>((set, get) => ({
    ...initialProjectState,

    // --- Actions ---

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
    }
}));
