import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import { useStore } from '../store/useStore';
import type { ProjectState } from '../store/projectState';

type ColorKey = keyof ProjectState['environment']['colors'];
type TpColorKey = keyof ProjectState['environment']['tweakpane'];

const TP_CSS_MAP: Record<TpColorKey, string> = {
  baseBackground:           '--tp-base-background-color',
  baseShadow:               '--tp-base-shadow-color',
  buttonBackground:         '--tp-button-background-color',
  buttonBackgroundActive:   '--tp-button-background-color-active',
  buttonBackgroundFocus:    '--tp-button-background-color-focus',
  buttonBackgroundHover:    '--tp-button-background-color-hover',
  buttonForeground:         '--tp-button-foreground-color',
  containerBackground:      '--tp-container-background-color',
  containerBackgroundActive:'--tp-container-background-color-active',
  containerBackgroundFocus: '--tp-container-background-color-focus',
  containerBackgroundHover: '--tp-container-background-color-hover',
  containerForeground:      '--tp-container-foreground-color',
  grooveForeground:         '--tp-groove-foreground-color',
  inputBackground:          '--tp-input-background-color',
  inputBackgroundActive:    '--tp-input-background-color-active',
  inputBackgroundFocus:     '--tp-input-background-color-focus',
  inputBackgroundHover:     '--tp-input-background-color-hover',
  inputForeground:          '--tp-input-foreground-color',
  labelForeground:          '--tp-label-foreground-color',
  monitorBackground:        '--tp-monitor-background-color',
  monitorForeground:        '--tp-monitor-foreground-color',
};

const TP_DEFS: { key: TpColorKey; label: string }[] = [
  { key: 'baseBackground',           label: 'Base Bg' },
  { key: 'baseShadow',               label: 'Base Shadow' },
  { key: 'buttonBackground',         label: 'Button Bg' },
  { key: 'buttonBackgroundActive',   label: 'Button Active' },
  { key: 'buttonBackgroundFocus',    label: 'Button Focus' },
  { key: 'buttonBackgroundHover',    label: 'Button Hover' },
  { key: 'buttonForeground',         label: 'Button Fg' },
  { key: 'containerBackground',      label: 'Container Bg' },
  { key: 'containerBackgroundActive', label: 'Container Active' },
  { key: 'containerBackgroundFocus', label: 'Container Focus' },
  { key: 'containerBackgroundHover', label: 'Container Hover' },
  { key: 'containerForeground',      label: 'Container Fg' },
  { key: 'grooveForeground',         label: 'Groove Fg' },
  { key: 'inputBackground',          label: 'Input Bg' },
  { key: 'inputBackgroundActive',    label: 'Input Active' },
  { key: 'inputBackgroundFocus',     label: 'Input Focus' },
  { key: 'inputBackgroundHover',     label: 'Input Hover' },
  { key: 'inputForeground',          label: 'Input Fg' },
  { key: 'labelForeground',          label: 'Label Fg' },
  { key: 'monitorBackground',        label: 'Monitor Bg' },
  { key: 'monitorForeground',        label: 'Monitor Fg' },
];

function applyTweakpaneTheme(tp: Record<TpColorKey, string>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(TP_CSS_MAP)) {
    root.style.setProperty(cssVar, tp[key as TpColorKey]);
  }
}

const GL_CSS_MAP: Record<string, string> = {
  glBackground:        '--gl-background',
  glContentBackground: '--gl-content-background',
  glTabBackground:     '--gl-tab-background',
  glTabText:           '--gl-tab-text',
  glTabActiveText:     '--gl-tab-active-text',
  glTabFocusAccent:    '--gl-tab-focus-accent',
  glSplitterHover:     '--gl-splitter-hover',
  topBarBackground:    '--topbar-background',
  topBarBorder:        '--topbar-border',
  topBarButtonBg:      '--topbar-button-bg',
  topBarButtonBorder:  '--topbar-button-border',
  topBarText:          '--topbar-text',
};

function applyGeneralTheme(colors: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(GL_CSS_MAP)) {
    if (colors[key]) root.style.setProperty(cssVar, colors[key]);
  }
}

const COLOR_DEFS: { key: ColorKey; label: string; folder: string }[] = [
  { key: 'topBarBackground',  label: 'Top Bar Bg',      folder: 'General' },
  { key: 'topBarBorder',      label: 'Top Bar Border',  folder: 'General' },
  { key: 'topBarButtonBg',    label: 'Button Bg',       folder: 'General' },
  { key: 'topBarButtonBorder',label: 'Button Border',   folder: 'General' },
  { key: 'topBarText',        label: 'Top Bar Text',    folder: 'General' },
  { key: 'glBackground',      label: 'GL Background',   folder: 'General' },
  { key: 'glContentBackground',label: 'GL Content Bg',  folder: 'General' },
  { key: 'glTabBackground',   label: 'GL Tab Bg',       folder: 'General' },
  { key: 'glTabText',         label: 'GL Tab Text',     folder: 'General' },
  { key: 'glTabActiveText',   label: 'GL Tab Active',   folder: 'General' },
  { key: 'glTabFocusAccent',  label: 'GL Tab Focus',    folder: 'General' },
  { key: 'glSplitterHover',   label: 'GL Splitter',     folder: 'General' },
  { key: 'sceneBackground',   label: 'Background',     folder: 'Scene' },
  { key: 'sceneFog',          label: 'Fog',             folder: 'Scene' },
  { key: 'groundPlane',       label: 'Ground Plane',    folder: 'Scene' },
  { key: 'gridLines',         label: 'Grid Lines',      folder: 'Scene' },
  { key: 'hemisphereSky',     label: 'Hemi Sky',        folder: 'Lighting' },
  { key: 'hemisphereGround',  label: 'Hemi Ground',     folder: 'Lighting' },
  { key: 'directionalLight',  label: 'Key Light',       folder: 'Lighting' },
  { key: 'modelMaterial',     label: 'Material',        folder: 'Model' },
  { key: 'modelEdges',        label: 'Edges',           folder: 'Model' },
  { key: 'modelVertices',     label: 'Vertices',        folder: 'Model' },
  { key: 'tessellationLines', label: 'Tessellation',    folder: 'Model' },
  { key: 'faceHighlight',     label: 'Face Hover',      folder: 'Highlight' },
  { key: 'edgeHighlight',     label: 'Edge Hover',      folder: 'Highlight' },
  { key: 'vertexHighlight',   label: 'Vertex Hover',    folder: 'Highlight' },
  { key: 'gizmoX',            label: 'X Axis',          folder: 'Gizmo' },
  { key: 'gizmoY',            label: 'Y Axis',          folder: 'Gizmo' },
  { key: 'gizmoZ',            label: 'Z Axis',          folder: 'Gizmo' },
  { key: 'consoleBackground', label: 'Background',      folder: 'Console' },
  { key: 'consoleText',       label: 'Text',            folder: 'Console' },
  { key: 'consoleError',      label: 'Error',           folder: 'Console' },
  { key: 'consoleWarning',    label: 'Warning',         folder: 'Console' },
  { key: 'gcodeBackground',   label: 'Background',      folder: 'G-Code' },
  { key: 'gcodeComment',      label: 'Comment',         folder: 'G-Code' },
  { key: 'gcodeG',            label: 'G Command',       folder: 'G-Code' },
  { key: 'gcodeM',            label: 'M Command',       folder: 'G-Code' },
  { key: 'gcodeParameter',    label: 'Parameter',       folder: 'G-Code' },
];

const EnvironmentWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  useEffect(() => {
    if (!containerRef.current || paneRef.current) return;

    const pane = new Pane({
      container: containerRef.current,
      title: 'Environment',
    });
    paneRef.current = pane;

    const state = useStore.getState();
    const bindingColors = { ...state.environment.colors };
    const bindingTp = { ...state.environment.tweakpane };

    // Apply current themes on mount
    applyTweakpaneTheme(bindingTp);
    applyGeneralTheme(bindingColors as any);

    // Theme preset selector
    const presetParams = { preset: state.environment.themePreset };
    pane.addBinding(presetParams, 'preset', {
      label: 'Theme Preset',
      options: { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f' },
    }).on('change', (ev: any) => {
      useStore.getState().setThemePreset(ev.value);
    });

    // Reference color picker — inline with full RGB sliders
    const refFolder = pane.addFolder({ title: 'Reference Picker', expanded: true });
    const refParams = { reference: '#ff0055ff' };
    refFolder.addBinding(refParams, 'reference', {
      label: 'Scratch Pad',
      picker: 'inline',
      expanded: true,
    });

    // Build folders from COLOR_DEFS
    const folders = new Map<string, any>();
    for (const def of COLOR_DEFS) {
      if (!folders.has(def.folder)) {
        folders.set(def.folder, pane.addFolder({ title: def.folder, expanded: true }));
      }
    }

    for (const def of COLOR_DEFS) {
      const folder = folders.get(def.folder)!;
      folder.addBinding(bindingColors, def.key, {
        label: def.label,
        view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setEnvironmentColor(def.key, ev.value);
        applyGeneralTheme(useStore.getState().environment.colors as any);
      });
    }

    // Tweakpane theme folder
    const tpFolder = pane.addFolder({ title: 'Tweakpane', expanded: true });
    for (const def of TP_DEFS) {
      tpFolder.addBinding(bindingTp, def.key, {
        label: def.label,
        view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setTweakpaneColor(def.key as TpColorKey, ev.value);
        applyTweakpaneTheme(useStore.getState().environment.tweakpane);
      });
    }

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
        overflowY: 'auto',
      }}
    />
  );
};

export default EnvironmentWindow;
