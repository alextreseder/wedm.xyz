import React, { useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import ErrorBoundary from './ErrorBoundary';

const hex6 = (c: string) => c.length === 9 ? c.slice(0, 7) : c;

const FONT = 'Consolas, "Courier New", monospace';
const FONT_SIZE = 14;
const LINE_HEIGHT = '21px';
const PAD = 8;
const GUTTER_W = 48;

const TOKEN_RE =
  /(\([^)\n]*\))|(;[^\n]*)|([Gg]\d+\.?\d*)|([Mm]\d+\.?\d*)|([A-Fa-fH-Lh-lN-Zn-z][+-]?\d*\.?\d+)/g;

function buildHighlight(
  text: string,
  c: { txt: string; g: string; m: string; arg: string },
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text))) {
    if (match.index > last)
      out.push(
        <span key={k++} style={{ color: c.txt }}>
          {text.slice(last, match.index)}
        </span>,
      );

    const color =
      match[1] || match[2] ? c.txt : match[3] ? c.g : match[4] ? c.m : c.arg;
    out.push(
      <span key={k++} style={{ color }}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }

  if (last < text.length)
    out.push(
      <span key={k++} style={{ color: c.txt }}>
        {text.slice(last)}
      </span>,
    );
  return out;
}

const GCodeEditorContent: React.FC = () => {
  const text = useStore((s) => s.gcode.text);
  const setText = useStore((s) => s.setGCodeText);
  const bg = useStore((s) => s.environment.colors.gcodeBackground);
  const commentClr = useStore((s) => s.environment.colors.gcodeComment);
  const gClr = useStore((s) => s.environment.colors.gcodeG);
  const mClr = useStore((s) => s.environment.colors.gcodeM);
  const paramClr = useStore((s) => s.environment.colors.gcodeParameter);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    [setText],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setText(ta.value.substring(0, start) + '  ' + ta.value.substring(end));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [setText],
  );

  const colors = useMemo(
    () => ({
      txt: hex6(commentClr),
      g: hex6(gClr),
      m: hex6(mClr),
      arg: hex6(paramClr),
    }),
    [commentClr, gClr, mClr, paramClr],
  );

  const highlighted = useMemo(() => buildHighlight(text, colors), [text, colors]);
  const lineCount = text.split('\n').length;
  const bgHex = hex6(bg);
  const textHex = hex6(commentClr);

  const shared: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    margin: 0,
    border: 'none',
    outline: 'none',
    padding: PAD,
    whiteSpace: 'pre',
    wordWrap: 'normal',
    boxSizing: 'border-box',
    letterSpacing: 'normal',
    tabSize: 2,
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: bgHex,
        overflow: 'hidden',
      }}
    >
      {/* Line-number gutter */}
      <div
        ref={gutRef}
        style={{
          width: GUTTER_W,
          flexShrink: 0,
          overflow: 'hidden',
          paddingTop: PAD,
          textAlign: 'right',
          userSelect: 'none',
          color: textHex,
          opacity: 0.35,
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          backgroundColor: bgHex,
          borderRight: `1px solid ${textHex}22`,
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} style={{ paddingRight: 8 }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Syntax-highlighted layer (visual only) */}
        <pre
          ref={preRef}
          aria-hidden
          style={{
            ...shared,
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {highlighted}
          {'\n'}
        </pre>

        {/* Editable textarea (transparent text, visible caret) */}
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          style={{
            ...shared,
            position: 'absolute',
            inset: 0,
            overflow: 'auto',
            background: 'transparent',
            color: 'transparent',
            caretColor: textHex,
            resize: 'none',
            WebkitTextFillColor: 'transparent',
          }}
        />
      </div>
    </div>
  );
};

const GCodeWindow: React.FC = () => (
  <ErrorBoundary
    fallback={
      <div style={{ color: 'white', padding: '10px' }}>
        Error loading G-Code Editor
      </div>
    }
  >
    <GCodeEditorContent />
  </ErrorBoundary>
);

export default GCodeWindow;
