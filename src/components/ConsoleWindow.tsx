import React, { useEffect, useState, useRef } from 'react';
import { subscribeToConsole, initConsoleCapture } from '../utils/consoleCapture';
import type { LogMessage } from '../utils/consoleCapture';

// Initialize capture globally
initConsoleCapture();

const ConsoleWindow: React.FC = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Welcome message
    const welcomeId = Math.random().toString(36).substr(2, 9);
    setLogs(prev => [
      ...prev,
      {
        id: welcomeId,
        level: 'info',
        content: `Welcome to WEDM.XYZ 0V01 - Import a model to begin`,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);

    // Subscribe to new logs
    const unsubscribe = subscribeToConsole((newLog) => {
      setLogs(prev => [...prev, newLog]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getColor = (level: string) => {
    switch (level) {
      case 'error': return '#ff5555'; // Red
      case 'warn': return '#ffb86c';  // Orange
      default: return '#f8f8f2';      // White
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'hsl(240, 14%, 10%)', // Eigengrau
      color: '#f8f8f2',
      fontFamily: 'monospace',
      padding: '10px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      fontSize: '13px'
    }}>
      {logs.map((log) => (
        <div key={log.id} style={{ 
          marginBottom: '4px',
          color: getColor(log.level),
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          paddingBottom: '2px',
          wordBreak: 'break-all'
        }}>
          <span style={{ opacity: 0.5, marginRight: '8px', fontSize: '11px' }}>
            [{log.timestamp}]
          </span>
          {log.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default ConsoleWindow;
