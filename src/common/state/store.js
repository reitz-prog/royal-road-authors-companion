// Centralized state management

import { emit } from '../events/emitter.js';

const state = {
  currentFictionId: null,
  isDashboardMode: false,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  contactsOpen: false,  // v2: contacts panel closed by default
  shoutouts: new Map(),
  contacts: [],
  myFictions: []
};

const subscribers = new Map();

/**
 * Get entire state or a specific key
 */
export function getState(key) {
  if (key) return state[key];
  return { ...state };
}

/**
 * Set state and notify subscribers
 */
export function setState(key, value) {
  const oldValue = state[key];
  state[key] = value;

  // Notify key-specific subscribers
  const callbacks = subscribers.get(key);
  if (callbacks) {
    callbacks.forEach(cb => cb(value, oldValue));
  }

  // Emit global state change event
  emit('state:change', { key, value, oldValue });
}

/**
 * Subscribe to state changes for a specific key
 */
export function subscribe(key, callback) {
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  subscribers.get(key).add(callback);

  // Return unsubscribe function
  return () => subscribers.get(key)?.delete(callback);
}

/**
 * Batch state updates
 */
export function batchUpdate(updates) {
  Object.entries(updates).forEach(([key, value]) => {
    state[key] = value;
  });
  emit('state:batch', updates);
}

export default { getState, setState, subscribe, batchUpdate };
