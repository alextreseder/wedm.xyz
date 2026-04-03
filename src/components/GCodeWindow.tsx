import React, { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import ErrorBoundary from './ErrorBoundary';

// Lazy load the Monaco Editor to prevent bundle initialization issues
const Editor = lazy(() => import('@monaco-editor/react'));

const hex6 = (color: string) => color.length === 9 ? color.slice(0, 7) : color;

const GCodeEditorContent: React.FC = () => {
  const gcodeText = useStore((state) => state.gcode.text);
  const setGCodeText = useStore((state) => state.setGCodeText);
  const gcodeBg = useStore((state) => state.environment.colors.gcodeBackground);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setGCodeText(value);
    }
  };

  const handleBeforeMount = (monaco: any) => {
    const bg = hex6(gcodeBg);
    monaco.editor.defineTheme('wedm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': bg,
        'editor.lineHighlightBackground': '#1f2130',
        'editorGutter.background': bg,
      }
    });
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Editor
        height="100%"
        defaultLanguage="gcode"
        theme="wedm-dark"
        value={gcodeText}
        onChange={handleEditorChange}
        beforeMount={handleBeforeMount}
        options={{
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
    </div>
  );
};

const GCodeWindow: React.FC = () => {
    return (
        <ErrorBoundary fallback={<div style={{color: 'white', padding: '10px'}}>Error loading G-Code Editor module</div>}>
            <Suspense fallback={<div style={{color: '#888', padding: '10px'}}>Loading Editor...</div>}>
                <GCodeEditorContent />
            </Suspense>
        </ErrorBoundary>
    );
};

export default GCodeWindow;
