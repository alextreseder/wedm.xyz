type Listener<T> = (data: T) => void;

class EventBus {
  private listeners: { [key: string]: Listener<any>[] } = {};

  on<T>(event: string, listener: Listener<T>) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return () => this.off(event, listener);
  }

  off<T>(event: string, listener: Listener<T>) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
  }

  emit<T>(event: string, data: T) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(listener => listener(data));
  }
}

export const eventBus = new EventBus();

// Event Types
export const EVENTS = {
  MODEL_LOADED: 'MODEL_LOADED', // Payload: string (blob url)
};
