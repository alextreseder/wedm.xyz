// Type definitions for log messages
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogMessage {
  id: string;
  level: LogLevel;
  content: string;
  timestamp: string;
}

type Listener = (log: LogMessage) => void;

const listeners: Set<Listener> = new Set();
let isInitialized = false;

// Store original console methods to prevent infinite loops and allow restoration
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

const formatArgs = (args: any[]): string => {
  return args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, Object.getOwnPropertyNames(arg));
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
};

const notify = (level: LogLevel, args: any[]) => {
  const content = formatArgs(args);
  const log: LogMessage = {
    id: Math.random().toString(36).substr(2, 9),
    level,
    content,
    timestamp: new Date().toLocaleTimeString(),
  };
  
  listeners.forEach(listener => listener(log));
};

export const initConsoleCapture = () => {
  if (isInitialized) return;
  isInitialized = true;

  console.log = (...args: any[]) => {
    originalConsole.log(...args);
    notify('info', args);
  };

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args);
    notify('warn', args);
  };

  console.error = (...args: any[]) => {
    originalConsole.error(...args);
    notify('error', args);
  };
};

export const subscribeToConsole = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
