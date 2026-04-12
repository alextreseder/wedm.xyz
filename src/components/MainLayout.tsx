import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoldenLayout, LayoutConfig, ComponentContainer } from 'golden-layout';
import type { JsonValue } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';

import StandardWindow from './StandardWindow';
import ConsoleWindow from './ConsoleWindow';
import SceneWindow from './SceneWindow';
import ConfigWindow from './ConfigWindow';
import GCodeWindow from './GCodeWindow';
import EnvironmentWindow from './EnvironmentWindow';
import { useStore } from '../store/useStore';
import { initialProjectState } from '../store/projectState';

/**
 * Interface representing the state for the standard window component.
 */
interface WindowState {
  label: string;
}

const MainLayout: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<GoldenLayout | null>(null);

  useLayoutEffect(() => {
    // Ensure the container element exists
    if (!containerRef.current) return;

    // Prevent double initialization in Strict Mode (React 18+)
    if (layoutRef.current) return;

    // Initialize Golden Layout
    const layout = new GoldenLayout(containerRef.current);
    layoutRef.current = layout;

    /**
     * Register 'standard-window'
     * Renders the StandardWindow React component into the Golden Layout container.
     */
    layout.registerComponentFactoryFunction('standard-window', (container: ComponentContainer, state: JsonValue | undefined) => {
      const componentState = state as unknown as WindowState;
      const root = createRoot(container.element);
      
      root.render(<StandardWindow label={componentState?.label} />);
      
      // Cleanup React root when the container is destroyed
      container.on('destroy', () => {
        root.unmount();
      });
    });

    /**
     * Register 'console-window'
     * Renders the ConsoleWindow React component.
     */
    layout.registerComponentFactoryFunction('console-window', (container: ComponentContainer) => {
      const root = createRoot(container.element);
      
      root.render(<ConsoleWindow />);
      
      container.on('destroy', () => {
        root.unmount();
      });
    });

    /**
     * Register 'scene-window'
     * Renders the SceneWindow React component (Three.js).
     */
    layout.registerComponentFactoryFunction('scene-window', (container: ComponentContainer) => {
      const root = createRoot(container.element);
      
      root.render(<SceneWindow />);
      
      container.on('destroy', () => {
        root.unmount();
      });
    });

    /**
     * Register 'config-window'
     * Renders the ConfigWindow React component (Tweakpane).
     */
    layout.registerComponentFactoryFunction('config-window', (container: ComponentContainer) => {
      const root = createRoot(container.element);
      root.render(<ConfigWindow />);
      container.on('destroy', () => { root.unmount(); });
    });

    /**
     * Register 'gcode-window'
     * Renders the GCodeWindow React component.
     */
    layout.registerComponentFactoryFunction('gcode-window', (container: ComponentContainer) => {
      const root = createRoot(container.element);
      root.render(<GCodeWindow />);
      container.on('destroy', () => { root.unmount(); });
    });

    layout.registerComponentFactoryFunction('simulation-window', (container: ComponentContainer, state: JsonValue | undefined) => {
      const componentState = state as unknown as WindowState;
      const root = createRoot(container.element);
      root.render(<StandardWindow label={componentState?.label} />);
      container.on('destroy', () => { root.unmount(); });
    });

    layout.registerComponentFactoryFunction('environment-window', (container: ComponentContainer) => {
      const root = createRoot(container.element);
      root.render(<EnvironmentWindow />);
      container.on('destroy', () => { root.unmount(); });
    });

    const savedLayout = useStore.getState().layout;
    try {
      layout.loadLayout(savedLayout as LayoutConfig);
    } catch (e) {
      console.warn('Failed to restore saved layout:', e);
      layout.loadLayout(initialProjectState.layout as LayoutConfig);
    }

    let saveTimer: ReturnType<typeof setTimeout>;
    layout.on('stateChanged', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (layoutRef.current) {
          try {
            const resolved = layoutRef.current.saveLayout();
            const config = LayoutConfig.fromResolved(resolved);
            useStore.getState().setLayoutConfig(config as Record<string, any>);
          } catch {
            // Layout may be mid-destruction; ignore
          }
        }
      }, 300);
    });

    // Handle window resize events
    const handleResize = () => {
      if (layoutRef.current && containerRef.current) {
        layoutRef.current.updateRootSize(); 
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      clearTimeout(saveTimer);
      window.removeEventListener('resize', handleResize);
      if (layoutRef.current) {
        layoutRef.current.destroy();
        layoutRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        flexGrow: 1,
        position: 'relative'
      }} 
    />
  );
};

export default MainLayout;
