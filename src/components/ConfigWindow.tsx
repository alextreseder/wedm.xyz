import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import * as TweakpaneEssentialsPlugin from '@tweakpane/plugin-essentials';

const ConfigWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

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
        { title: 'Cost' },
        { title: 'Kernel' },
        { title: 'Drill' },
        { title: 'Dev' },
      ],
    }) as any;

    // --- CAM Tab ---
    const camParams = {
        wireTension: 15,
        wireSpeed: 50,
        kerfDiameter: 0.25,
        numberOfPasses: 1,
        tolerance: 0.01,
    };

    const camPage = tab.pages[0];

    camPage.addBinding(camParams, 'wireTension', { 
        min: 1, max: 30, 
        label: 'Wire Tension',
        format: (v: number) => `${v.toFixed(1)} N`
    });
    
    camPage.addBinding(camParams, 'wireSpeed', { 
        min: 1, max: 100, 
        label: 'Wire Speed',
        format: (v: number) => `${v.toFixed(0)} mm/s`
    });
    
    camPage.addBinding(camParams, 'kerfDiameter', { 
        label: 'Kerf Diameter',
        step: 0.01
    });
    
    camPage.addBinding(camParams, 'numberOfPasses', {
        options: {
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5
        },
        label: 'Passes'
    });

    camPage.addButton({ title: 'Lead In / Lead Out' }).on('click', () => {
        console.log('Lead In / Lead Out clicked');
    });

    camPage.addBinding(camParams, 'tolerance', { 
        min: 0.001, max: 0.05, 
        label: 'Tolerance',
        format: (v: number) => `${v.toFixed(3)} mm`
    });

    camPage.addBlade({ view: 'separator' });

    camPage.addButton({ title: 'Translate' }).on('click', () => {
        console.log('Translate clicked');
    });

    camPage.addButton({ title: 'Rotate' }).on('click', () => {
        console.log('Rotate clicked');
    });


    // --- Spark Tab ---
    const sparkPage = tab.pages[1];

    const sparkParams = {
        pulseOnTime: 10,
        pulseOffTime: 10,
        dutyCycle: 50,
        frequency: 50,
        peakCurrent: 5,
        servoVoltage: 25,
        peakVoltage: 80,
        polarity: true,
    };

    // --- Temporal Folder ---
    const temporalFolder = sparkPage.addFolder({ title: 'Temporal' });

    // Interdependent Logic for Temporal Params
    const updateTemporal = (changedKey: string) => {
        if (changedKey === 'on' || changedKey === 'off') {
            // Update Duty Cycle and Frequency based on On/Off Time
            const period = sparkParams.pulseOnTime + sparkParams.pulseOffTime;
            if (period > 0) {
                sparkParams.dutyCycle = (sparkParams.pulseOnTime / period) * 100;
                sparkParams.frequency = 1000 / period; // 1000 us / period(us) = Mhz? No. 
                                                       // 1/(period * 10^-6) Hz
                                                       // 10^6 / period = Hz
                                                       // 10^3 / period = kHz
            }
        } else if (changedKey === 'freq' || changedKey === 'duty') {
            // Update On/Off Time based on Frequency and Duty Cycle
            if (sparkParams.frequency > 0) {
                const period = 1000 / sparkParams.frequency; // period in us
                sparkParams.pulseOnTime = (sparkParams.dutyCycle / 100) * period;
                sparkParams.pulseOffTime = period - sparkParams.pulseOnTime;
            }
        }
        (pane as any).refresh();
    };

    temporalFolder.addBinding(sparkParams, 'pulseOnTime', { 
        min: 1, max: 1000, 
        label: 'Pulse On (µs)',
        format: (v: number) => v.toFixed(1)
    }).on('change', () => updateTemporal('on'));

    temporalFolder.addBinding(sparkParams, 'pulseOffTime', { 
        min: 1, max: 1000, 
        label: 'Pulse Off (µs)',
        format: (v: number) => v.toFixed(1)
    }).on('change', () => updateTemporal('off'));

    temporalFolder.addBinding(sparkParams, 'dutyCycle', { 
        min: 0, max: 100, 
        label: 'Duty Cycle (%)',
        format: (v: number) => v.toFixed(1)
    }).on('change', () => updateTemporal('duty'));

    temporalFolder.addBinding(sparkParams, 'frequency', { 
        min: 1, max: 1000, 
        label: 'Frequency (kHz)',
        format: (v: number) => v.toFixed(1)
    }).on('change', () => updateTemporal('freq'));


    // --- Magnitude Folder ---
    const magnitudeFolder = sparkPage.addFolder({ title: 'Magnitude' });

    magnitudeFolder.addBinding(sparkParams, 'peakCurrent', { 
        min: 0.1, max: 50, 
        label: 'Peak Current (A)',
        format: (v: number) => v.toFixed(1)
    });

    magnitudeFolder.addBinding(sparkParams, 'servoVoltage', { 
        min: 15, max: 45, 
        label: 'Servo Voltage (V)',
        format: (v: number) => v.toFixed(1)
    });

    magnitudeFolder.addBinding(sparkParams, 'peakVoltage', { 
        min: 50, max: 200, 
        label: 'Peak Voltage (V)',
        format: (v: number) => v.toFixed(0)
    });

    magnitudeFolder.addBinding(sparkParams, 'polarity', { 
        label: 'Polarity',
        options: {
            'Electrode Positive': true,
            'Electrode Negative': false
        }
    });

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

        // Calculate current "time" in the pulse cycle based on index (0-49)
        const totalTime = sparkParams.pulseOnTime + sparkParams.pulseOffTime;
        const onFraction = totalTime > 0 ? sparkParams.pulseOnTime / totalTime : 0.5;
        const onSteps = Math.floor(onFraction * SIM_LENGTH);
        
        const i = scopeState.index;
        
        // Voltage Logic
        if (i === 0) scopeState.voltage = 0;
        else if (i === 1) scopeState.voltage = sparkParams.peakVoltage;
        else if (i < onSteps) scopeState.voltage = sparkParams.servoVoltage;
        else scopeState.voltage = 0;
        
        // Current Logic
        if (i < 2) scopeState.current = 0;
        else if (i < onSteps) scopeState.current = sparkParams.peakCurrent;
        else scopeState.current = 0;
        
        // Refresh graphs
        voltageGraph.refresh();
        currentGraph.refresh();
        
        // Increment index
        scopeState.index = (scopeState.index + 1) % SIM_LENGTH;
    };

    const simInterval = setInterval(simulateScope, 20); // 50 points * 20ms = 1s per cycle visualization (slowed down for visibility)

    // --- Cost Tab ---
    const costParams = {
        materialCost: 50,
        machineRate: 30,
    };
    tab.pages[2].addBinding(costParams, 'materialCost', { label: 'Material $/kg' });
    tab.pages[2].addBinding(costParams, 'machineRate', { label: 'Machine $/hr' });

    // --- Kernel Tab ---
    const kernelParams = {
        version: '1.0.0',
        debugMode: false,
    };
    tab.pages[3].addBinding(kernelParams, 'version', { readonly: true });
    tab.pages[3].addBinding(kernelParams, 'debugMode');

    // --- Drill Tab ---
    const drillParams = {
        diameter: 3.0,
        depth: 10.0,
        peck: true,
    };
    tab.pages[4].addBinding(drillParams, 'diameter', { min: 0.1, max: 20 });
    tab.pages[4].addBinding(drillParams, 'depth', { min: 0.1, max: 100 });
    tab.pages[4].addBinding(drillParams, 'peck');

    // --- Dev Tab ---
    tab.pages[5].addButton({ title: 'Log State' }).on('click', () => {
        console.log('Current Params:', { camParams, sparkParams, costParams, kernelParams, drillParams });
    });

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
