import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import * as TweakpaneEssentialsPlugin from '@tweakpane/plugin-essentials';

const InterfaceWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  useEffect(() => {
    if (!containerRef.current || paneRef.current) return;

    // Initialize Tweakpane
    const pane = new Pane({
      container: containerRef.current,
      title: 'Interface Control',
    });
    pane.registerPlugin(TweakpaneEssentialsPlugin);
    paneRef.current = pane;

    // --- Visibility Folder ---
    const visFolder = pane.addFolder({ title: 'Visibility', expanded: true });

    const visParams = {
        mesh: true,
        meshLines: false,
        faces: true,
        edges: false,
        vertices: false
    };

    visFolder.addBinding(visParams, 'mesh', { label: 'Mesh' });
    visFolder.addBinding(visParams, 'meshLines', { label: 'Mesh Lines' });
    visFolder.addBinding(visParams, 'faces', { label: 'Faces' });
    visFolder.addBinding(visParams, 'edges', { label: 'Edges' });
    visFolder.addBinding(visParams, 'vertices', { label: 'Vertices' });

    // Cleanup
    return () => {
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

export default InterfaceWindow;
