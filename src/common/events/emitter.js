// Simple event emitter for cross-module communication

const listeners = new Map();

/**
 * Emit an event
 */
export function emit(event, data) {
  const callbacks = listeners.get(event);
  if (callbacks) {
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[RR] Event handler error for "${event}":`, e);
      }
    });
  }
}

/**
 * Subscribe to an event
 */
export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);
}

/**
 * Unsubscribe from an event
 */
export function off(event, callback) {
  const callbacks = listeners.get(event);
  if (callbacks) {
    callbacks.delete(callback);
  }
}

/**
 * Subscribe once
 */
export function once(event, callback) {
  const wrapper = (data) => {
    off(event, wrapper);
    callback(data);
  };
  on(event, wrapper);
}

export default { emit, on, off, once };
