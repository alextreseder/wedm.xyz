import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import * as TweakpaneEssentialsPlugin from '@tweakpane/plugin-essentials';
import { useStore } from '../store/useStore';

import { reprocessCurrentModel } from '../services/occtService';

const ConfigWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);
  
  // Ref to hold the debounce timer
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || paneRef.current) return;

    // Initialize Tweakpane
    const pane = new Pane({
      container: containerRef.current,
      title: 'Configuration',
    });
    pane.registerPlugin(TweakpaneEssentialsPlugin);
    paneRef.current = pane;

    // Create Tabs
    const tab = (pane as any).addBlade({
      view: 'tab',
      pages: [
        { title: 'CAM' },
        { title: 'Spark' },
        { title: 'Graphics' },
        { title: 'Dev' },
      ],
    }) as any;

    // Get initial state (reference for binding)
    // We bind Tweakpane directly to a proxy object initialized from the store
    // Updates are pushed to the store via .on('change')
    const state = useStore.getState();
    
    // Create a local mutable object for Tweakpane to bind to
    // We will sync this with the store
    const bindingParams = {
        cam: { ...state.params.cam },
        spark: { ...state.params.spark },
        cost: { ...state.params.cost },
        kernel: { ...state.params.kernel },
        drill: { ...state.params.drill },
        units: { ...state.params.units }
    };

    // --- CAM Tab ---
    const camPage = tab.pages[0];

    // Units Folder
    const unitsFolder = camPage.addFolder({ title: 'Units', expanded: false });
    
    unitsFolder.addButton({ title: 'Change to in' }).on('click', () => {
        useStore.getState().setUnitSystem('in');
        console.log('Changed units to inches');
    });
    
    unitsFolder.addButton({ title: 'Change to mm' }).on('click', () => {
        useStore.getState().setUnitSystem('mm');
        console.log('Changed units to mm');
    });
    
    unitsFolder.addButton({ title: 'Scale to in' }).on('click', () => {
        useStore.getState().scaleParams(1/25.4);
        useStore.getState().setUnitSystem('in');
        // Refresh UI
        Object.assign(bindingParams.cam, useStore.getState().params.cam);
        Object.assign(bindingParams.drill, useStore.getState().params.drill);
        (pane as any).refresh();
        console.log('Scaled to inches');
    });
    
    unitsFolder.addButton({ title: 'Scale to mm' }).on('click', () => {
        useStore.getState().scaleParams(25.4);
        useStore.getState().setUnitSystem('mm');
        // Refresh UI
        Object.assign(bindingParams.cam, useStore.getState().params.cam);
        Object.assign(bindingParams.drill, useStore.getState().params.drill);
        (pane as any).refresh();
        console.log('Scaled to mm');
    });
    
    unitsFolder.addButton({ title: 'Scale 10%' }).on('click', () => {
        useStore.getState().scaleParams(0.1);
        Object.assign(bindingParams.cam, useStore.getState().params.cam);
        Object.assign(bindingParams.drill, useStore.getState().params.drill);
        (pane as any).refresh();
    });
    
    unitsFolder.addButton({ title: 'Scale 1000%' }).on('click', () => {
        useStore.getState().scaleParams(10);
        Object.assign(bindingParams.cam, useStore.getState().params.cam);
        Object.assign(bindingParams.drill, useStore.getState().params.drill);
        (pane as any).refresh();
    });

    camPage.addBinding(bindingParams.cam, 'wireTension', { 
        min: 1, max: 30, 
        label: 'Wire Tension',
        format: (v: number) => `${v.toFixed(1)} N`
    }).on('change', (ev: any) => useStore.getState().setCamParam('wireTension', ev.value));
    
    camPage.addBinding(bindingParams.cam, 'wireSpeed', { 
        min: 1, max: 100, 
        label: 'Wire Speed',
        format: (v: number) => `${v.toFixed(0)} mm/s`
    }).on('change', (ev: any) => useStore.getState().setCamParam('wireSpeed', ev.value));
    
    camPage.addBinding(bindingParams.cam, 'kerfDiameter', { 
        label: 'Kerf Diameter',
        step: 0.01
    }).on('change', (ev: any) => useStore.getState().setCamParam('kerfDiameter', ev.value));
    
    camPage.addBinding(bindingParams.cam, 'numberOfPasses', {
        options: {
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5
        },
        label: 'Passes'
    }).on('change', (ev: any) => useStore.getState().setCamParam('numberOfPasses', ev.value));
    
    camPage.addBinding(bindingParams.cam, 'tolerance', { 
        min: 0.001, max: 0.05, 
        label: 'Tolerance',
        format: (v: number) => `${v.toFixed(3)} mm`
    }).on('change', (ev: any) => useStore.getState().setCamParam('tolerance', ev.value));

    camPage.addBlade({ view: 'separator' });

    camPage.addButton({ title: 'Lead In / Lead Out' }).on('click', () => console.log('Lead In / Lead Out'));
    camPage.addButton({ title: 'Translate' }).on('click', () => console.log('Translate'));
    camPage.addButton({ title: 'Rotate' }).on('click', () => console.log('Rotate'));

    camPage.addBlade({ view: 'separator' });

    camPage.addBinding(bindingParams.cam, 'upperGuideZ', { label: 'Upper Guide Z' })
        .on('change', (ev: any) => useStore.getState().setCamParam('upperGuideZ', ev.value));
        
    camPage.addBinding(bindingParams.cam, 'lowerGuideZ', { label: 'Lower Guide Z' })
        .on('change', (ev: any) => useStore.getState().setCamParam('lowerGuideZ', ev.value));

    camPage.addBlade({ view: 'separator' });

    camPage.addButton({ title: 'Solve CAM' }).on('click', () => console.log('Solve CAM'));

    // Functions Folder
    const functionsFolder = camPage.addFolder({ title: 'Functions', expanded: false });
    functionsFolder.addButton({ title: 'Auto Orient' }).on('click', () => console.log('Auto Orient'));
    functionsFolder.addButton({ title: 'Detect Wall Shell' }).on('click', () => console.log('Detect Wall Shell'));
    functionsFolder.addButton({ title: 'Generate Offset Shell' }).on('click', () => console.log('Generate Offset Shell'));
    functionsFolder.addButton({ title: 'Extend to Guide Planes' }).on('click', () => console.log('Extend to Guide Planes'));
    functionsFolder.addButton({ title: 'Intersect' }).on('click', () => console.log('Intersect'));
    functionsFolder.addButton({ title: 'Rasterize' }).on('click', () => console.log('Rasterize'));
    functionsFolder.addButton({ title: 'Linking' }).on('click', () => console.log('Linking'));
    functionsFolder.addButton({ title: 'Post' }).on('click', () => console.log('Post'));


    // --- Spark Tab ---
    const sparkPage = tab.pages[1];

    // --- Temporal Folder ---
    const temporalFolder = sparkPage.addFolder({ title: 'Temporal' });

    const updateTemporal = (changedKey: 'on' | 'off' | 'duty' | 'freq') => {
       useStore.getState().updateTemporalParams(changedKey);
       // We must update our local binding params to reflect the calculated changes
       const newSpark = useStore.getState().params.spark;
       Object.assign(bindingParams.spark, newSpark);
       (pane as any).refresh();
    };

    temporalFolder.addBinding(bindingParams.spark, 'pulseOnTime', { 
        min: 1, max: 1000, 
        label: 'Pulse On (µs)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => {
        useStore.getState().setSparkParam('pulseOnTime', ev.value);
        updateTemporal('on');
    });

    temporalFolder.addBinding(bindingParams.spark, 'pulseOffTime', { 
        min: 1, max: 1000, 
        label: 'Pulse Off (µs)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => {
        useStore.getState().setSparkParam('pulseOffTime', ev.value);
        updateTemporal('off');
    });

    temporalFolder.addBinding(bindingParams.spark, 'dutyCycle', { 
        min: 0, max: 100, 
        label: 'Duty Cycle (%)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => {
        useStore.getState().setSparkParam('dutyCycle', ev.value);
        updateTemporal('duty');
    });

    temporalFolder.addBinding(bindingParams.spark, 'frequency', { 
        min: 1, max: 1000, 
        label: 'Frequency (kHz)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => {
        useStore.getState().setSparkParam('frequency', ev.value);
        updateTemporal('freq');
    });


    // --- Magnitude Folder ---
    const magnitudeFolder = sparkPage.addFolder({ title: 'Magnitude' });

    magnitudeFolder.addBinding(bindingParams.spark, 'peakCurrent', { 
        min: 0.1, max: 50, 
        label: 'Peak Current (A)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => useStore.getState().setSparkParam('peakCurrent', ev.value));

    magnitudeFolder.addBinding(bindingParams.spark, 'servoVoltage', { 
        min: 15, max: 45, 
        label: 'Servo Voltage (V)',
        format: (v: number) => v.toFixed(1)
    }).on('change', (ev: any) => useStore.getState().setSparkParam('servoVoltage', ev.value));

    magnitudeFolder.addBinding(bindingParams.spark, 'peakVoltage', { 
        min: 50, max: 200, 
        label: 'Peak Voltage (V)',
        format: (v: number) => v.toFixed(0)
    }).on('change', (ev: any) => useStore.getState().setSparkParam('peakVoltage', ev.value));

    magnitudeFolder.addBinding(bindingParams.spark, 'polarity', { 
        label: 'Polarity',
        options: {
            'Electrode Positive': 'positive', // Updated to match store type
            'Electrode Negative': 'negative'
        }
    }).on('change', (ev: any) => useStore.getState().setSparkParam('polarity', ev.value));

    // --- Oscilloscopes (Graphs) Folder ---
    const scopeFolder = sparkPage.addFolder({ title: 'Oscilloscopes', expanded: true });

    const scopeState = {
        voltage: 0,
        current: 0,
        index: 0
    };

    // Using a faster interval for the graph binding to make it look like a scope
    const voltageGraph = scopeFolder.addBinding(scopeState, 'voltage', {
        readonly: true,
        view: 'graph',
        min: -10, max: 250, // Adjusted for peak voltage range
        label: 'Voltage',
        interval: 20, // Faster update
    });

    const currentGraph = scopeFolder.addBinding(scopeState, 'current', {
        readonly: true,
        view: 'graph',
        min: -1, max: 60, // Adjusted for peak current range
        label: 'Current',
        interval: 20,
    });

    // Simulation Loop
    const SIM_LENGTH = 50;
    
    const simulateScope = () => {
        if (!paneRef.current) return;

        // Use current store values for simulation
        const currentSpark = useStore.getState().params.spark;

        // Calculate current "time" in the pulse cycle based on index (0-49)
        const totalTime = currentSpark.pulseOnTime + currentSpark.pulseOffTime;
        const onFraction = totalTime > 0 ? currentSpark.pulseOnTime / totalTime : 0.5;
        const onSteps = Math.floor(onFraction * SIM_LENGTH);
        
        const i = scopeState.index;
        
        // Voltage Logic
        if (i === 0) scopeState.voltage = 0;
        else if (i === 1) scopeState.voltage = currentSpark.peakVoltage;
        else if (i < onSteps) scopeState.voltage = currentSpark.servoVoltage;
        else scopeState.voltage = 0;
        
        // Current Logic
        if (i < 2) scopeState.current = 0;
        else if (i < onSteps) scopeState.current = currentSpark.peakCurrent;
        else scopeState.current = 0;
        
        // Refresh graphs
        voltageGraph.refresh();
        currentGraph.refresh();
        
        // Increment index
        scopeState.index = (scopeState.index + 1) % SIM_LENGTH;
    };

    const simInterval = setInterval(simulateScope, 20); 

    // --- Graphics Tab ---
    const graphicsPage = tab.pages[2];
    
    // Visibility Folder
    const visibilityFolder = graphicsPage.addFolder({ title: 'Visibility', expanded: true });
    
    // Create local binding for visibility checkboxes
    const visibilityParams = { ...state.mesh.visibility };
    
    visibilityFolder.addBinding(visibilityParams, 'faces', { label: 'Face' })
        .on('change', (ev: any) => useStore.getState().setVisibility('faces', ev.value));
        
    visibilityFolder.addBinding(visibilityParams, 'edges', { label: 'Edge' })
        .on('change', (ev: any) => useStore.getState().setVisibility('edges', ev.value));
        
    visibilityFolder.addBinding(visibilityParams, 'vertices', { label: 'Vertex' })
        .on('change', (ev: any) => useStore.getState().setVisibility('vertices', ev.value));
        
    visibilityFolder.addBinding(visibilityParams, 'tessellation', { label: 'Tessellation' })
        .on('change', (ev: any) => useStore.getState().setVisibility('tessellation', ev.value));
    
    visibilityFolder.addBlade({ view: 'separator' });
    
    visibilityFolder.addButton({ title: 'Show Land Faces' }).on('click', () => {
        const { topPlaneId, bottomPlaneId } = useStore.getState().brep.features;
        console.log('Land Faces:', { top: topPlaneId, bottom: bottomPlaneId });
    });
    
    visibilityFolder.addButton({ title: 'Show Wall Faces' }).on('click', () => {
        const { walls } = useStore.getState().brep.features;
        console.log('Wall Faces:', walls);
    });

    // Mesh Resolution (kept in Graphics)
    graphicsPage.addBinding(bindingParams.kernel, 'meshResolution', {
        min: 0.1,
        max: 10.0,
        label: 'Mesh Resolution',
    }).on('change', (ev: any) => {
        useStore.getState().setKernelParam('meshResolution', ev.value);
        
        // Debounce reprocessing
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        
        debounceTimerRef.current = window.setTimeout(() => {
            reprocessCurrentModel(ev.value);
        }, 500); // 500ms delay
    });

    // --- Dev Tab ---
    const devPage = tab.pages[3];
    
    devPage.addButton({ title: 'Log State' }).on('click', () => {
        console.log('Current Store State:', useStore.getState());
    });

    devPage.addButton({ title: 'Copy State JSON' }).on('click', () => {
        const json = JSON.stringify(useStore.getState(), null, 2);
        navigator.clipboard.writeText(json).then(() => {
            console.log('State copied to clipboard!');
            alert('State copied to clipboard! You can paste this into jsoncrack.com');
        }).catch(err => {
            console.error('Failed to copy state:', err);
        });
    });

    // Cost Folder (moved from Cost tab)
    const costFolder = devPage.addFolder({ title: 'Cost', expanded: false });
    costFolder.addBinding(bindingParams.cost, 'materialCost', { label: 'Material $/kg' })
        .on('change', (ev: any) => useStore.getState().setCostParam('materialCost', ev.value));
    costFolder.addBinding(bindingParams.cost, 'machineRate', { label: 'Machine $/hr' })
        .on('change', (ev: any) => useStore.getState().setCostParam('machineRate', ev.value));

    // Drill Folder (moved from Drill tab)
    const drillFolder = devPage.addFolder({ title: 'Drill', expanded: false });
    drillFolder.addBinding(bindingParams.drill, 'diameter', { min: 0.1, max: 20, label: 'Diameter' })
        .on('change', (ev: any) => useStore.getState().setDrillParam('diameter', ev.value));
    drillFolder.addBinding(bindingParams.drill, 'depth', { min: 0.1, max: 100, label: 'Depth' })
        .on('change', (ev: any) => useStore.getState().setDrillParam('depth', ev.value));
    drillFolder.addBinding(bindingParams.drill, 'peck', { label: 'Peck' })
        .on('change', (ev: any) => useStore.getState().setDrillParam('peck', ev.value));

    return () => {
      clearInterval(simInterval);
      if (paneRef.current) {
        paneRef.current.dispose();
        paneRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: 'hsl(240, 14%, 10%)',
        overflowY: 'auto'
      }} 
    />
  );
};

export default ConfigWindow;
