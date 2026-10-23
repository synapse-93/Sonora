/**
 * Sonora — Centralized Reactive State Store
 * Implements an Observable Store Pattern with fine-grained key-based subscriptions.
 * Adheres strictly to ARCHITECTURE.md Section 3.
 */

// Initial default application state
const initialState = {
  // Navigation & View
  currentView: 'home', // 'home' | 'library' | 'playlists' | 'playlist-detail' | 'favourites' | 'recent'
  isSidebarOpen: false, // For responsive/mobile drawer
  isQueueOpen: false,   // Queue side drawer toggle
  isDragOver: false,    // For drag-and-drop overlay

  // Library & Catalog
  items: new Map(),
  searchQuery: '',
  filterType: 'all',    // 'all' | 'audio' | 'video'
  sortKey: 'date',      // 'date' | 'name' | 'duration' | 'size'
  sortDir: 'desc',      // 'asc' | 'desc'
  selectedMediaId: null,
  favourites: new Set(),

  // History & Recently Played
  history: [], // Array<{ mediaId: string, playedAt: number, playCount: number }>

  // Playlists
  playlists: new Map(), // Map<playlistId, { id, name, itemIds: string[], createdAt, updatedAt }>
  activePlaylistId: null,

  // Playback Queue
  activeQueue: [],
  currentIndex: 0,
  repeatMode: 'all',    // 'off' | 'all' | 'one'
  shuffleEnabled: false,

  // Modals & UI overlays
  activeModal: null,    // null | 'create_playlist' | 'add_to_playlist' | 'rename_playlist' | 'confirm_delete'
  modalData: null,

  // Playback Engine State (Phase 2/3 Active Engine)
  playback: {
    status: 'idle',     // 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
    currentTrackId: null,
    currentTime: 0,
    duration: 0,
    volume: 0.85,
    isMuted: false,
    playbackRate: 1.0,
    isEngineAvailable: true,
    error: null
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
 * Updates nested playback state safely and triggers subscribers.
 * @param {object} playbackUpdates
 */
export function setPlaybackState(playbackUpdates) {
  const newPlayback = { ...currentState.playback, ...playbackUpdates };
  setState({ playback: newPlayback });
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
    isSidebarOpen: false,
    isDragOver: false
  });
}
