import type { ProjectState } from '../store/projectState';

/* ===================================================================
   16-Color Palette (mode-independent, no alpha)
   =================================================================== */

export interface PaletteColors {
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
}

export type PaletteKey = keyof PaletteColors;

/* ===================================================================
   Color math helpers
   =================================================================== */

function parseHex8(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
}

function toHex8(r: number, g: number, b: number, a: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}${c(a)}`;
}

function lerp(a: string, b: string, t: number): string {
  const [r1, g1, b1, a1] = parseHex8(a);
  const [r2, g2, b2, a2] = parseHex8(b);
  return toHex8(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
    a1 + (a2 - a1) * t,
  );
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex8(hex);
  return toHex8(r, g, b, Math.round(alpha * 255));
}

/* ---- HSV helpers ------------------------------------------------- */

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function shiftValue(hex: string, contrast: number): string {
  const [r, g, b, a] = parseHex8(hex);
  const [h, s, v] = rgbToHsv(r, g, b);
  const nv = v < 0.5 ? Math.min(1, v + contrast) : Math.max(0, v - contrast);
  const [nr, ng, nb] = hsvToRgb(h, s, nv);
  return toHex8(nr, ng, nb, a);
}

/* ===================================================================
   Color derivation matrix
   ───────────────────────────────────────────────────────────────────
   Each row: [colorKey, darkSource, lightSource]
   A source is a PaletteKey string (direct lookup) or a function.
   faceHighlight is computed after the matrix pass (HSV shift).
   =================================================================== */

type Colors = ProjectState['environment']['colors'];
type Src = PaletteKey | ((p: PaletteColors) => string);

const COLOR_MATRIX: [keyof Colors, Src, Src][] = [
  //                          DARK                LIGHT
  // ── Scene ──────────────────────────────────────────────
  ['sceneBackground',        'dark2',             'light1'],
  ['sceneFog',               'dark2',             'light2'],
  ['groundPlane',            'dark1',             'light1'],
  ['gridLines',              'light1',            'content3'],

  // ── Model ──────────────────────────────────────────────
  ['modelMaterial',          'light2',            'light2'],
  ['modelEdges',             'dark1',             'dark1'],
  ['modelVertices',          'dark1',             'dark1'],
  ['tessellationLines',      'content3',          'content3'],

  // ── Highlights (face computed via HSV) ─────────────────
  ['edgeHighlight',          'light2',            'light2'],
  ['vertexHighlight',        'light2',            'light2'],

  // ── Lighting ───────────────────────────────────────────
  ['hemisphereSky',          'light2',            'light1'],
  ['hemisphereGround',       'content3',          'light2'],
  ['directionalLight',       'light1',            'light1'],

  // ── Gizmo (mode-independent) ───────────────────────────
  ['gizmoX',                 'accent1',           'accent1'],
  ['gizmoY',                 'accent4',           'accent4'],
  ['gizmoZ',                 'accent6',           'accent6'],

  // ── Console ────────────────────────────────────────────
  ['consoleBackground',      'dark2',             'light1'],
  ['consoleText',            'light1',            'dark1'],
  ['consoleError',           'accent1',           'accent1'],
  ['consoleWarning',         'accent5',           'accent5'],

  // ── G-Code ─────────────────────────────────────────────
  ['gcodeBackground',        'dark2',             'light1'],
  ['gcodeComment',           'light1',            'dark1'],
  ['gcodeG',                 'accent1',           'accent1'],
  ['gcodeM',                 'accent2',           'accent2'],
  ['gcodeParameter',         'accent3',           'accent3'],
  ['gcodeLineHighlight',     'content2',          (p) => lerp(p.light1, p.content3, 0.30)],

  // ── Top Bar ────────────────────────────────────────────
  ['topBarBackground',       'dark1',             'dark1'],
  ['topBarBorder',           'content3',          'dark2'],
  ['topBarButtonBg',         'content3',          'dark2'],
  ['topBarButtonBorder',     'content3',          'content1'],
  ['topBarText',             'light2',            'light2'],

  // ── Golden Layout ──────────────────────────────────────
  ['glBackground',           'dark1',             'content3'],
  ['glContentBackground',    'content2',          'content4'],
  ['glTabBackground',        'dark1',             'content3'],
  ['glTabText',              'content4',          'light2'],
  ['glTabActiveText',        'light1',            'light2'],
  ['glTabFocusAccent',       'accent6',           'accent6'],
  ['glSplitterHover',        'content3',          'content4'],
  ['glWindowBg',             'dark2',             'light1'],

  // ── Simulation ─────────────────────────────────────────
  ['simBackground',          'dark2',             'light1'],
  ['simText',                'light1',            'dark1'],
];

/* ===================================================================
   Public API
   =================================================================== */

export function deriveColors(
  p: PaletteColors,
  mode: string,
  faceHighlightContrast: number = 0.20,
): Colors {
  const isDark = mode !== 'Light';
  const result = {} as Record<string, string>;

  for (const [key, darkSrc, lightSrc] of COLOR_MATRIX) {
    const src = isDark ? darkSrc : lightSrc;
    result[key] = typeof src === 'function' ? src(p) : p[src];
  }

  result.faceHighlight = shiftValue(result.modelMaterial, faceHighlightContrast);

  return result as Colors;
}

export function deriveTweakpane(
  p: PaletteColors,
  mode: string,
): ProjectState['environment']['tweakpane'] {
  if (mode === 'Light') return deriveTweakpaneLight(p);
  return deriveTweakpaneDark(p);
}

/* ---- Tweakpane themes -------------------------------------------- */

function deriveTweakpaneDark(p: PaletteColors): ProjectState['environment']['tweakpane'] {
  return {
    baseBackground:            p.dark2,
    baseShadow:                withAlpha(p.dark1, 0.20),
    buttonBackground:          p.light1,
    buttonBackgroundHover:     lerp(p.light1, p.light2, 0.15),
    buttonBackgroundFocus:     lerp(p.light1, p.light2, 0.30),
    buttonBackgroundActive:    lerp(p.light1, p.light2, 0.45),
    buttonForeground:          p.dark2,
    containerBackground:       p.content2,
    containerBackgroundHover:  lerp(p.content2, p.content3, 0.25),
    containerBackgroundFocus:  lerp(p.content2, p.content3, 0.50),
    containerBackgroundActive: lerp(p.content2, p.content3, 0.75),
    containerForeground:       p.light1,
    grooveForeground:          p.content1,
    inputBackground:           p.content1,
    inputBackgroundHover:      lerp(p.content1, p.content2, 0.25),
    inputBackgroundFocus:      lerp(p.content1, p.content2, 0.50),
    inputBackgroundActive:     lerp(p.content1, p.content2, 0.75),
    inputForeground:           p.light1,
    labelForeground:           p.content4,
    monitorBackground:         p.content1,
    monitorForeground:         p.content4,
  };
}

function deriveTweakpaneLight(p: PaletteColors): ProjectState['environment']['tweakpane'] {
  return {
    baseBackground:            p.light1,
    baseShadow:                withAlpha(p.dark1, 0.10),
    buttonBackground:          p.content4,
    buttonBackgroundHover:     lerp(p.content4, p.content3, 0.25),
    buttonBackgroundFocus:     lerp(p.content4, p.content3, 0.50),
    buttonBackgroundActive:    lerp(p.content4, p.content3, 0.75),
    buttonForeground:          p.light2,
    containerBackground:       withAlpha(p.dark1, 0.08),
    containerBackgroundHover:  withAlpha(p.dark1, 0.12),
    containerBackgroundFocus:  withAlpha(p.dark1, 0.16),
    containerBackgroundActive: withAlpha(p.dark1, 0.20),
    containerForeground:       p.dark1,
    grooveForeground:          withAlpha(p.dark1, 0.08),
    inputBackground:           withAlpha(p.dark1, 0.06),
    inputBackgroundHover:      withAlpha(p.dark1, 0.10),
    inputBackgroundFocus:      withAlpha(p.dark1, 0.14),
    inputBackgroundActive:     withAlpha(p.dark1, 0.18),
    inputForeground:           p.dark1,
    labelForeground:           withAlpha(p.dark1, 0.65),
    monitorBackground:         withAlpha(p.dark1, 0.08),
    monitorForeground:         withAlpha(p.dark1, 0.50),
  };
}
