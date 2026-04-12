import React, { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import { useStore } from '../store/useStore';
import type { PaletteColors, PaletteKey } from '../utils/deriveTheme';

/* ===================================================================
   Palette → CSS variable map (tweakpane + golden-layout + topbar)
   =================================================================== */

const CSS_MAP: Record<string, string> = {
  // Tweakpane
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
  // Golden Layout & top bar
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

function pushCSS(colors: Record<string, string>, tp: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_MAP)) {
    const val = tp[key] ?? colors[key];
    if (val) root.style.setProperty(cssVar, val);
  }
}

/* ===================================================================
   Palette defs & theme presets
   =================================================================== */

const PALETTE_DEFS: { key: PaletteKey; label: string; folder: string }[] = [
  { key: 'dark1',    label: 'Dark 1',    folder: 'Darks' },
  { key: 'dark2',    label: 'Dark 2',    folder: 'Darks' },
  { key: 'content1', label: 'Content 1', folder: 'Content' },
  { key: 'content2', label: 'Content 2', folder: 'Content' },
  { key: 'content3', label: 'Content 3', folder: 'Content' },
  { key: 'content4', label: 'Content 4', folder: 'Content' },
  { key: 'light1',   label: 'Light 1',   folder: 'Lights' },
  { key: 'light2',   label: 'Light 2',   folder: 'Lights' },
  ...Array.from({ length: 8 }, (_, i) => ({
    key: `accent${i + 1}` as PaletteKey,
    label: `Accent ${i + 1}`,
    folder: 'Accents',
  })),
];

const THEME_PRESETS: Record<string, PaletteColors> = {
  Default: {
    dark1: '#111111ff',     dark2: '#1e1e1eff',
    content1: '#333333ff',  content2: '#4c4c4cff',
    content3: '#b2b2b2ff',  content4: '#ccccccff',
    light1: '#e0e0e0ff',    light2: '#ffffffff',
    accent1: '#f73c3cff',   accent2: '#ff9d00ff',
    accent3: '#e6e600ff',   accent4: '#6ccb26ff',
    accent5: '#6cebffff',   accent6: '#178cf0ff',
    accent7: '#5b6ef5ff',   accent8: '#c549c9ff',
  },
  Iceberg: {
    dark1: '#000000ff',     dark2: '#16161dff',
    content1: '#0d0f14ff',  content2: '#1f2130ff',
    content3: '#2d2e38ff',  content4: '#6c7089ff',
    light1: '#c5c6cdff',    light2: '#ffffffff',
    accent1: '#d47d7bff',   accent2: '#d9a67eff',
    accent3: '#b6bd88ff',   accent4: '#89c2b6ff',
    accent5: '#89acc2ff',   accent6: '#9292c0ff',
    accent7: '#b594c3ff',   accent8: '#c394b0ff',
  },
  Solarized: {
    dark1: '#002b36ff',     dark2: '#073642ff',
    content1: '#586e75ff',  content2: '#657b83ff',
    content3: '#839496ff',  content4: '#93a1a1ff',
    light1: '#eee8d5ff',    light2: '#fdf6e3ff',
    accent1: '#dc322fff',   accent2: '#cb4b16ff',
    accent3: '#b58900ff',   accent4: '#859900ff',
    accent5: '#2aa198ff',   accent6: '#268bd2ff',
    accent7: '#6c71c4ff',   accent8: '#d33682ff',
  },
};

/* ===================================================================
   Component
   =================================================================== */

const EnvironmentWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  useEffect(() => {
    if (!containerRef.current || paneRef.current) return;

    const pane = new Pane({ container: containerRef.current, title: 'Environment' });
    paneRef.current = pane;
    const p = pane as any;

    const state = useStore.getState();
    const bindPalette = { ...state.environment.palette } as Record<string, string>;

    pushCSS(state.environment.colors, state.environment.tweakpane);

    const sync = () => {
      const s = useStore.getState();
      Object.assign(bindPalette, s.environment.palette);
      pushCSS(s.environment.colors, s.environment.tweakpane);
      p.refresh();
    };

    // --- Preset selector ---
    const ui = {
      palette: state.environment.themePreset,
      mode: state.environment.themeMode,
    };

    p.addBinding(ui, 'palette', {
      label: 'Palette',
      options: Object.fromEntries(Object.keys(THEME_PRESETS).map(n => [n, n])),
    }).on('change', (ev: any) => {
      const pal = THEME_PRESETS[ev.value];
      if (!pal) return;
      useStore.getState().setThemePreset(ev.value);
      useStore.getState().applyPalette(pal);
      sync();
    });

    // --- Mode selector ---
    p.addBinding(ui, 'mode', {
      label: 'Mode',
      options: { Dark: 'Dark', Light: 'Light' },
    }).on('change', (ev: any) => {
      useStore.getState().setThemeMode(ev.value);
      sync();
    });

    // --- Face HL contrast ---
    const hlParams = { contrast: state.environment.faceHighlightContrast };
    p.addBinding(hlParams, 'contrast', {
      label: 'HL Contrast', min: 0, max: 1, step: 0.01,
    }).on('change', (ev: any) => {
      useStore.getState().setFaceHighlightContrast(ev.value);
    });

    // --- Palette colors (16) ---
    const paletteFolder = p.addFolder({ title: 'Palette', expanded: true });
    const folders = new Map<string, any>();

    for (const def of PALETTE_DEFS) {
      let f = folders.get(def.folder);
      if (!f) {
        f = paletteFolder.addFolder({ title: def.folder, expanded: true });
        folders.set(def.folder, f);
      }
      f.addBinding(bindPalette, def.key, {
        label: def.label, view: 'color',
      }).on('change', (ev: any) => {
        useStore.getState().setPaletteColor(def.key, ev.value);
        sync();
      });
    }

    return () => {
      paneRef.current?.dispose();
      paneRef.current = null;
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
