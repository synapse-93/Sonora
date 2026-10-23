/**
 * Sonora — Centralized Reactive State Store
 * Implements an Observable Store Pattern with fine-grained key-based subscriptions.
 * Adheres strictly to ARCHITECTURE.md Section 3.
 */

// Initial default application state
const initialState = {
  // Navigation & View
  currentView: 'home', // 'home' | 'library' | 'playlists' | 'favourites'
  isSidebarOpen: false, // For responsive/mobile drawer
  isQueueOpen: false,   // Queue side drawer toggle

  // Library & Catalog
  items: new Map(),
  searchQuery: '',
  filterType: 'all',    // 'all' | 'audio' | 'video'
  selectedMediaId: null,
  favourites: new Set(['trk_01', 'trk_03']), // Pre-seed a couple for demonstration

  // Playback Queue
  activeQueue: ['trk_01', 'trk_02', 'trk_04'],
  currentIndex: 0,
  repeatMode: 'all',    // 'off' | 'all' | 'one'
  shuffleEnabled: false,

  // Playback Engine State (visual foundation for Phase 1)
  playback: {
    status: 'idle',     // 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
    currentTrackId: null,
    currentTime: 0,
    duration: 0,
    volume: 0.85,
    isMuted: false,
    playbackRate: 1.0,
    isEngineAvailable: false // Explicitly false in Phase 1
  }
};

let currentState = { ...initialState };
const listeners = new Map(); // Map<key, Set<Function>>

/**
 * Returns a read-only snapshot of current state.
 * @returns {object}
 */
export function getState() {
  return currentState;
}

/**
 * Updates application state and dispatches notifications to subscribed listeners.
 * @param {object} updates Partial state updates
 */
export function setState(updates) {
  const changedKeys = [];

  for (const [key, value] of Object.entries(updates)) {
    if (currentState[key] !== value) {
      currentState = { ...currentState, [key]: value };
      changedKeys.push(key);
    }
  }

  for (const key of changedKeys) {
    if (listeners.has(key)) {
      listeners.get(key).forEach((cb) => {
        try {
          cb(currentState[key], currentState);
        } catch (err) {
          console.error(`Error in state subscriber for key "${key}":`, err);
        }
      });
    }
  }

  // Also trigger wildcard subscribers if any
  if (changedKeys.length > 0 && listeners.has('*')) {
    listeners.get('*').forEach((cb) => cb(currentState, changedKeys));
  }
}

/**
 * Registers a listener callback triggered whenever the specified key changes.
 * @param {string} key State key to subscribe to, or '*' for all changes
 * @param {Function} callback Callback receiving (newValue, fullState)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  return () => {
    if (listeners.has(key)) {
      listeners.get(key).delete(callback);
    }
  };
}

/**
 * Resets transient playback and UI state to initial defaults.
 */
export function reset() {
  setState({
    searchQuery: '',
    filterType: 'all',
    isQueueOpen: false,
    isSidebarOpen: false
  });
}
