import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import { useStore } from '../store/useStore';
import type { ProjectState } from '../store/projectState';
import type { PaletteColors, PaletteKey } from '../utils/deriveTheme';

type ColorKey = keyof ProjectState['environment']['colors'];
type TpColorKey = keyof ProjectState['environment']['tweakpane'];

/* ===================================================================
   Palette definitions (the 16 user-facing colors)
   =================================================================== */

const PALETTE_DEFS: { key: PaletteKey; label: string; folder: string }[] = [
  { key: 'dark1',           label: 'Dark 1',    folder: 'Dark Backgrounds' },
  { key: 'dark2',           label: 'Dark 2',    folder: 'Dark Backgrounds' },
  { key: 'content1',        label: 'Content 1', folder: 'Content Tones' },
  { key: 'content2',        label: 'Content 2', folder: 'Content Tones' },
  { key: 'content3',        label: 'Content 3', folder: 'Content Tones' },
  { key: 'content4',        label: 'Content 4', folder: 'Content Tones' },
  { key: 'light1',          label: 'Light 1',   folder: 'Light Backgrounds' },
  { key: 'light2',          label: 'Light 2',   folder: 'Light Backgrounds' },
  { key: 'accentRed',       label: 'Accent 1',  folder: 'Accents' },
  { key: 'accentGreen',     label: 'Accent 2',  folder: 'Accents' },
  { key: 'accentBlue',      label: 'Accent 3',  folder: 'Accents' },
  { key: 'accentCyan',      label: 'Accent 4',  folder: 'Accents' },
  { key: 'accentOrange',    label: 'Accent 5',  folder: 'Accents' },
  { key: 'accentIndigo',    label: 'Accent 6',  folder: 'Accents' },
  { key: 'accentSurface',   label: 'Accent 7',  folder: 'Accents' },
  { key: 'accentHighlight', label: 'Accent 8',  folder: 'Accents' },
];

/* ===================================================================
   Advanced color definitions (derived, individually overridable)
   =================================================================== */

const COLOR_DEFS: { key: ColorKey; label: string; folder: string }[] = [
  { key: 'topBarBackground',   label: 'Top Bar Bg',     folder: 'General' },
  { key: 'topBarBorder',       label: 'Top Bar Border', folder: 'General' },
  { key: 'topBarButtonBg',     label: 'Button Bg',      folder: 'General' },
  { key: 'topBarButtonBorder', label: 'Button Border',  folder: 'General' },
  { key: 'topBarText',         label: 'Top Bar Text',   folder: 'General' },
  { key: 'glBackground',       label: 'GL Background',  folder: 'General' },
  { key: 'glContentBackground',label: 'GL Content Bg',  folder: 'General' },
  { key: 'glTabBackground',    label: 'GL Tab Bg',      folder: 'General' },
  { key: 'glTabText',          label: 'GL Tab Text',    folder: 'General' },
  { key: 'glTabActiveText',    label: 'GL Tab Active',  folder: 'General' },
  { key: 'glTabFocusAccent',   label: 'GL Tab Focus',   folder: 'General' },
  { key: 'glSplitterHover',    label: 'GL Splitter',    folder: 'General' },
  { key: 'glWindowBg',         label: 'GL Window BG',   folder: 'General' },

  { key: 'sceneBackground',    label: 'Background',     folder: 'Scene' },
  { key: 'sceneFog',           label: 'Fog',            folder: 'Scene' },
  { key: 'groundPlane',        label: 'Ground Plane',   folder: 'Scene' },
  { key: 'gridLines',          label: 'Grid Lines',     folder: 'Scene' },

  { key: 'hemisphereSky',      label: 'Hemi Sky',       folder: 'Lighting' },
  { key: 'hemisphereGround',   label: 'Hemi Ground',    folder: 'Lighting' },
  { key: 'directionalLight',   label: 'Key Light',      folder: 'Lighting' },

  { key: 'modelMaterial',      label: 'Material',       folder: 'Model' },
  { key: 'modelEdges',         label: 'Edges',          folder: 'Model' },
  { key: 'modelVertices',      label: 'Vertices',       folder: 'Model' },
  { key: 'tessellationLines',  label: 'Tessellation',   folder: 'Model' },

  { key: 'faceHighlight',      label: 'Face Hover',     folder: 'Highlight' },
  { key: 'edgeHighlight',      label: 'Edge Hover',     folder: 'Highlight' },
  { key: 'vertexHighlight',    label: 'Vertex Hover',   folder: 'Highlight' },

  { key: 'gizmoX',             label: 'X Axis',         folder: 'Gizmo' },
  { key: 'gizmoY',             label: 'Y Axis',         folder: 'Gizmo' },
  { key: 'gizmoZ',             label: 'Z Axis',         folder: 'Gizmo' },

  { key: 'consoleBackground',  label: 'Background',     folder: 'Console' },
  { key: 'consoleText',        label: 'Text',           folder: 'Console' },
  { key: 'consoleError',       label: 'Error',          folder: 'Console' },
  { key: 'consoleWarning',     label: 'Warning',        folder: 'Console' },

  { key: 'gcodeBackground',    label: 'Background',     folder: 'G-Code' },
  { key: 'gcodeComment',       label: 'Comment',        folder: 'G-Code' },
  { key: 'gcodeG',             label: 'G Command',      folder: 'G-Code' },
  { key: 'gcodeM',             label: 'M Command',      folder: 'G-Code' },
  { key: 'gcodeParameter',     label: 'Parameter',      folder: 'G-Code' },
  { key: 'gcodeLineHighlight', label: 'Line Highlight', folder: 'G-Code' },

  { key: 'simBackground',      label: 'Background',     folder: 'Simulation' },
  { key: 'simText',            label: 'Text',           folder: 'Simulation' },
];

const TP_CSS_MAP: Record<TpColorKey, string> = {
  baseBackground:            '--tp-base-background-color',
  baseShadow:                '--tp-base-shadow-color',
  buttonBackground:          '--tp-button-background-color',
  buttonBackgroundActive:    '--tp-button-background-color-active',
  buttonBackgroundFocus:     '--tp-button-background-color-focus',
  buttonBackgroundHover:     '--tp-button-background-color-hover',
  buttonForeground:          '--tp-button-foreground-color',
  containerBackground:       '--tp-container-background-color',
  containerBackgroundActive: '--tp-container-background-color-active',
  containerBackgroundFocus:  '--tp-container-background-color-focus',
  containerBackgroundHover:  '--tp-container-background-color-hover',
  containerForeground:       '--tp-container-foreground-color',
  grooveForeground:          '--tp-groove-foreground-color',
  inputBackground:           '--tp-input-background-color',
  inputBackgroundActive:     '--tp-input-background-color-active',
  inputBackgroundFocus:      '--tp-input-background-color-focus',
  inputBackgroundHover:      '--tp-input-background-color-hover',
  inputForeground:           '--tp-input-foreground-color',
  labelForeground:           '--tp-label-foreground-color',
  monitorBackground:         '--tp-monitor-background-color',
  monitorForeground:         '--tp-monitor-foreground-color',
};

const TP_DEFS: { key: TpColorKey; label: string }[] = [
  { key: 'baseBackground',            label: 'Base Bg' },
  { key: 'baseShadow',                label: 'Base Shadow' },
  { key: 'buttonBackground',          label: 'Button Bg' },
  { key: 'buttonBackgroundActive',    label: 'Button Active' },
  { key: 'buttonBackgroundFocus',     label: 'Button Focus' },
  { key: 'buttonBackgroundHover',     label: 'Button Hover' },
  { key: 'buttonForeground',          label: 'Button Fg' },
  { key: 'containerBackground',       label: 'Container Bg' },
  { key: 'containerBackgroundActive', label: 'Container Active' },
  { key: 'containerBackgroundFocus',  label: 'Container Focus' },
  { key: 'containerBackgroundHover',  label: 'Container Hover' },
  { key: 'containerForeground',       label: 'Container Fg' },
  { key: 'grooveForeground',          label: 'Groove Fg' },
  { key: 'inputBackground',           label: 'Input Bg' },
  { key: 'inputBackgroundActive',     label: 'Input Active' },
  { key: 'inputBackgroundFocus',      label: 'Input Focus' },
  { key: 'inputBackgroundHover',      label: 'Input Hover' },
  { key: 'inputForeground',           label: 'Input Fg' },
  { key: 'labelForeground',           label: 'Label Fg' },
  { key: 'monitorBackground',         label: 'Monitor Bg' },
  { key: 'monitorForeground',         label: 'Monitor Fg' },
];

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
  glWindowBg:          '--gl-window-bg',
};

/* ===================================================================
   Theme presets — palette name → 16 colors (mode-independent, no alpha)
   =================================================================== */

const THEME_PRESETS: Record<string, PaletteColors> = {
  Default: {
    dark1: '#111111ff',     dark2: '#1e1e1eff',
    content1: '#303030ff',  content2: '#505050ff',
    content3: '#808080ff',  content4: '#a0a0a0ff',
    light1: '#e0e0e0ff',    light2: '#ffffffff',
    accentRed: '#f73c3cff', accentGreen: '#6ccb26ff',
    accentBlue: '#178cf0ff',accentCyan: '#00ffffff',
    accentOrange: '#ffb86cff', accentIndigo: '#5b6ef5ff',
    accentSurface: '#e0e0e0ff', accentHighlight: '#ff0000ff',
  },
  Iceberg: {
    dark1: '#000000ff',     dark2: '#16161dff',
    content1: '#101218ff',  content2: '#1f2130ff',
    content3: '#333333ff',  content4: '#6c7089ff',
    light1: '#c5c6cdff',    light2: '#ffffffff',
    accentRed: '#f73c3cff', accentGreen: '#6ccb26ff',
    accentBlue: '#178cf0ff',accentCyan: '#00ffffff',
    accentOrange: '#ffb86cff', accentIndigo: '#354be3ff',
    accentSurface: '#f5f5f5ff', accentHighlight: '#ff0000ff',
  },
  Solarized: {
    dark1: '#002b36ff',     dark2: '#073642ff',
    content1: '#586e75ff',  content2: '#657b83ff',
    content3: '#839496ff',  content4: '#93a1a1ff',
    light1: '#eee8d5ff',    light2: '#fdf6e3ff',
    accentRed: '#b58900ff', accentGreen: '#cb4b16ff',
    accentBlue: '#dc322fff',accentCyan: '#d33682ff',
    accentOrange: '#6c71c4ff', accentIndigo: '#268bd2ff',
    accentSurface: '#2aa198ff', accentHighlight: '#859900ff',
  },
};

/* ===================================================================
   CSS application helpers
   =================================================================== */

function applyTweakpaneCSS(tp: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(TP_CSS_MAP)) {
    root.style.setProperty(cssVar, tp[key]);
  }
}

function applyGeneralCSS(colors: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(GL_CSS_MAP)) {
    if (colors[key]) root.style.setProperty(cssVar, colors[key]);
  }
}

/** Sync binding objects from store, push CSS, refresh pane */
function syncFromStore(
  bindPalette: Record<string, string>,
  bindColors: Record<string, string>,
  bindTp: Record<string, string>,
  p: any,
) {
  const s = useStore.getState();
  Object.assign(bindPalette, s.environment.palette);
  Object.assign(bindColors, s.environment.colors);
  Object.assign(bindTp, s.environment.tweakpane);
  applyTweakpaneCSS(s.environment.tweakpane);
  applyGeneralCSS(s.environment.colors);
  p.refresh();
}

/* ===================================================================
   Component
   =================================================================== */

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

    // Tweakpane v4 types don't fully expose addBinding / addFolder / refresh
    const p = pane as any;

    const state = useStore.getState();
    const bindPalette = { ...state.environment.palette } as Record<string, string>;
    const bindColors = { ...state.environment.colors } as Record<string, string>;
    const bindTp = { ...state.environment.tweakpane } as Record<string, string>;

    applyTweakpaneCSS(bindTp);
    applyGeneralCSS(bindColors);

    // --- Palette preset selector ---
    const paletteOptions: Record<string, string> = {};
    for (const name of Object.keys(THEME_PRESETS)) paletteOptions[name] = name;

    const selectorParams = {
      palette: state.environment.themePreset,
      mode: state.environment.themeMode,
    };

    p.addBinding(selectorParams, 'palette', {
      label: 'Palette',
      options: paletteOptions,
    }).on('change', (ev: any) => {
      const palette = THEME_PRESETS[ev.value];
      if (!palette) return;
      useStore.getState().setThemePreset(ev.value);
      useStore.getState().applyPalette(palette);
      syncFromStore(bindPalette, bindColors, bindTp, p);
    });

    // --- Dark / Light mode selector ---
    const modeOptions: Record<string, string> = { Dark: 'Dark', Light: 'Light' };

    p.addBinding(selectorParams, 'mode', {
      label: 'Mode',
      options: modeOptions,
    }).on('change', (ev: any) => {
      useStore.getState().setThemeMode(ev.value);
      syncFromStore(bindPalette, bindColors, bindTp, p);
    });

    // --- Reference color picker ---
    const refFolder = p.addFolder({ title: 'Reference Picker', expanded: true });
    const refParams = { reference: '#ff0055ff' };
    refFolder.addBinding(refParams, 'reference', {
      label: 'Scratch Pad',
      picker: 'inline',
      expanded: true,
    });

    // ===============================================================
    // PALETTE — 16 colors
    // ===============================================================
    const paletteFolder = p.addFolder({ title: 'Palette', expanded: true });
    const paletteFolders = new Map<string, any>();

    for (const def of PALETTE_DEFS) {
      if (!paletteFolders.has(def.folder)) {
        paletteFolders.set(
          def.folder,
          paletteFolder.addFolder({ title: def.folder, expanded: true }),
        );
      }
    }

    for (const def of PALETTE_DEFS) {
      paletteFolders.get(def.folder)!.addBinding(bindPalette, def.key, {
        label: def.label,
        view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setPaletteColor(def.key, ev.value);
        syncFromStore(bindPalette, bindColors, bindTp, p);
      });
    }

    // ===============================================================
    // ADVANCED — all derived colors (individually overridable)
    // ===============================================================
    const advFolder = p.addFolder({ title: 'Advanced', expanded: false });
    const colorFolders = new Map<string, any>();

    for (const def of COLOR_DEFS) {
      if (!colorFolders.has(def.folder)) {
        colorFolders.set(
          def.folder,
          advFolder.addFolder({ title: def.folder, expanded: true }),
        );
      }
    }

    for (const def of COLOR_DEFS) {
      colorFolders.get(def.folder)!.addBinding(bindColors, def.key, {
        label: def.label,
        view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setEnvironmentColor(def.key, ev.value);
        applyGeneralCSS(useStore.getState().environment.colors);
      });
    }

    // --- Tweakpane theme (inside Advanced) ---
    const tpFolder = advFolder.addFolder({ title: 'Tweakpane', expanded: true });
    for (const def of TP_DEFS) {
      tpFolder.addBinding(bindTp, def.key, {
        label: def.label,
        view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setTweakpaneColor(def.key, ev.value);
        applyTweakpaneCSS(useStore.getState().environment.tweakpane);
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
        backgroundColor: 'var(--gl-window-bg, #16161d)',
        overflowY: 'auto',
      }}
    />
  );
};

export default EnvironmentWindow;
