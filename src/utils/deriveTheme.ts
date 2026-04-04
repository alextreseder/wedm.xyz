import type { ProjectState } from '../store/projectState';

/* ===================================================================
   16-Color Palette (mode-independent, no alpha)
   =================================================================== */

export interface PaletteColors {
  dark1: string;           // Darkest tone
  dark2: string;           // Dark tone
  content1: string;        // Mid-dark tone
  content2: string;        // Mid tone
  content3: string;        // Mid-light tone
  content4: string;        // Muted tone
  light1: string;          // Light tone
  light2: string;          // Brightest tone
  accentRed: string;
  accentGreen: string;
  accentBlue: string;
  accentCyan: string;
  accentOrange: string;
  accentIndigo: string;
  accentSurface: string;
  accentHighlight: string;
}

export type PaletteKey = keyof PaletteColors;

/* ===================================================================
   Color math helpers (8-char hex with alpha)
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

/* ===================================================================
   Derive full color sets from palette + mode
   =================================================================== */

export function deriveColors(
  p: PaletteColors,
  mode: string,
): ProjectState['environment']['colors'] {
  if (mode === 'Light') return deriveColorsLight(p);
  return deriveColorsDark(p);
}

export function deriveTweakpane(
  p: PaletteColors,
  mode: string,
): ProjectState['environment']['tweakpane'] {
  if (mode === 'Light') return deriveTweakpaneLight(p);
  return deriveTweakpaneDark(p);
}

/* ---- Dark mode --------------------------------------------------- */

function deriveColorsDark(p: PaletteColors): ProjectState['environment']['colors'] {
  return {
    sceneBackground:    p.dark2,
    sceneFog:           p.dark2,
    groundPlane:        p.dark1,
    gridLines:          p.light1,

    modelMaterial:      p.accentSurface,
    modelEdges:         p.light2,
    modelVertices:      p.accentCyan,
    tessellationLines:  p.content3,

    faceHighlight:      p.accentHighlight,
    edgeHighlight:      p.accentHighlight,
    vertexHighlight:    p.accentHighlight,

    hemisphereSky:      p.light2,
    hemisphereGround:   p.content3,
    directionalLight:   p.light1,

    gizmoX:             p.accentRed,
    gizmoY:             p.accentGreen,
    gizmoZ:             p.accentBlue,

    consoleBackground:  p.dark2,
    consoleText:        p.light1,
    consoleError:       p.accentRed,
    consoleWarning:     p.accentOrange,

    gcodeBackground:    p.dark2,
    gcodeComment:       p.light1,
    gcodeG:             p.accentRed,
    gcodeM:             p.accentGreen,
    gcodeParameter:     p.accentBlue,
    gcodeLineHighlight: p.content2,

    topBarBackground:   p.dark1,
    topBarBorder:       p.content3,
    topBarButtonBg:     p.content3,
    topBarButtonBorder: p.content3,
    topBarText:         p.light2,

    glBackground:       p.dark1,
    glContentBackground:p.content2,
    glTabBackground:    p.dark1,
    glTabText:          p.content4,
    glTabActiveText:    p.light1,
    glTabFocusAccent:   p.accentIndigo,
    glSplitterHover:    p.content3,
    glWindowBg:         p.dark2,

    simBackground:      p.dark2,
    simText:            p.light1,
  };
}

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

/* ---- Light mode -------------------------------------------------- */

function deriveColorsLight(p: PaletteColors): ProjectState['environment']['colors'] {
  return {
    sceneBackground:    p.light1,
    sceneFog:           p.light1,
    groundPlane:        p.light2,
    gridLines:          p.content3,

    modelMaterial:      p.accentSurface,
    modelEdges:         p.dark1,
    modelVertices:      p.accentCyan,
    tessellationLines:  p.content3,

    faceHighlight:      p.accentHighlight,
    edgeHighlight:      p.accentHighlight,
    vertexHighlight:    p.accentHighlight,

    hemisphereSky:      p.light1,
    hemisphereGround:   p.light2,
    directionalLight:   p.light1,

    gizmoX:             p.accentRed,
    gizmoY:             p.accentGreen,
    gizmoZ:             p.accentBlue,

    consoleBackground:  p.light1,
    consoleText:        p.dark1,
    consoleError:       p.accentRed,
    consoleWarning:     p.accentOrange,

    gcodeBackground:    p.light1,
    gcodeComment:       p.dark1,
    gcodeG:             p.accentRed,
    gcodeM:             p.accentGreen,
    gcodeParameter:     p.accentBlue,
    gcodeLineHighlight: lerp(p.light1, p.content3, 0.30),

    topBarBackground:   p.dark1,
    topBarBorder:       p.dark2,
    topBarButtonBg:     p.dark2,
    topBarButtonBorder: p.content1,
    topBarText:         p.light2,

    glBackground:       p.content3,
    glContentBackground:p.content4,
    glTabBackground:    p.content3,
    glTabText:          p.light2,
    glTabActiveText:    p.light2,
    glTabFocusAccent:   p.accentIndigo,
    glSplitterHover:    p.content4,
    glWindowBg:         p.light1,

    simBackground:      p.light1,
    simText:            p.dark1,
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
