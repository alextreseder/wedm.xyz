import React, { Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import ErrorBoundary from './ErrorBoundary';

// Lazy load the Monaco Editor to prevent bundle initialization issues
const Editor = lazy(() => import('@monaco-editor/react'));

const GCodeEditorContent: React.FC = () => {
  // Select gcode text from store
  const gcodeText = useStore((state) => state.gcode.text);
  const setGCodeText = useStore((state) => state.setGCodeText);

  // Handle editor changes
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setGCodeText(value);
    }
  };

  // Define custom theme to match Config window (Iceberg theme base)
  const handleBeforeMount = (monaco: any) => {
    monaco.editor.defineTheme('wedm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#161722', // Matches hsla(230, 20%, 11%, 1.00)
        'editor.lineHighlightBackground': '#1f2130',
        'editorGutter.background': '#161722',
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
