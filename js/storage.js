/**
 * Sonora — Persistence Adapter (Phase 3)
 * Manages IndexedDB for structured library data, playlists, history, queue, and offline blobs.
 * Manages localStorage for lightweight user preferences.
 * Adheres strictly to ARCHITECTURE.md Section 2.3 & Section 6.
 */

const DB_NAME = 'sonora_db';
const DB_VERSION = 1;

// Preference localStorage key
const PREFS_KEY = 'sonora_v1_preferences';

class StorageAdapter {
  constructor() {
    this.db = null;
    this.isAvailable = false;
  }

  /**
   * Initializes IndexedDB database and creates object stores if needed.
   * @returns {Promise<boolean>}
   */
  async initDB() {
    if (!('indexedDB' in window)) {
      console.warn('[Storage] IndexedDB not supported by browser. Falling back to memory-only.');
      return false;
    }

    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // 1. Library metadata store
          if (!db.objectStoreNames.contains('library')) {
            const libraryStore = db.createObjectStore('library', { keyPath: 'id' });
            libraryStore.createIndex('title', 'title', { unique: false });
            libraryStore.createIndex('type', 'type', { unique: false });
            libraryStore.createIndex('addedAt', 'addedAt', { unique: false });
          }

          // 2. Playlists store
          if (!db.objectStoreNames.contains('playlists')) {
            const playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
            playlistStore.createIndex('name', 'name', { unique: false });
            playlistStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          // 3. Favourites store
          if (!db.objectStoreNames.contains('favourites')) {
            db.createObjectStore('favourites', { keyPath: 'mediaId' });
          }

          // 4. Recently played history store
          if (!db.objectStoreNames.contains('history')) {
            const historyStore = db.createObjectStore('history', { keyPath: 'mediaId' });
            historyStore.createIndex('playedAt', 'playedAt', { unique: false });
          }

          // 5. Active playback queue store
          if (!db.objectStoreNames.contains('queue')) {
            db.createObjectStore('queue', { keyPath: 'id' });
          }

          // 6. Media Blobs store (optional offline persistence)
          if (!db.objectStoreNames.contains('blobs')) {
            db.createObjectStore('blobs', { keyPath: 'id' });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isAvailable = true;
          console.log('[Storage] IndexedDB initialized successfully.');
          resolve(true);
        };

        request.onerror = (event) => {
          console.warn('[Storage] Failed to open IndexedDB:', event.target.error);
          this.isAvailable = false;
          resolve(false);
        };
      } catch (err) {
        console.warn('[Storage] IndexedDB initialization error:', err);
        this.isAvailable = false;
        resolve(false);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Library Metadata Operations
  // --------------------------------------------------------------------------

  /**
   * Saves or updates a library media record (metadata only, no File/URL).
   * @param {object} item
   * @returns {Promise<boolean>}
   */
  async saveLibraryItem(item) {
    if (!this.isAvailable || !item || !item.id) return false;

    // Sanitize record to ensure no un-serializable File or runtime Object URL is persisted
    const record = {
      id: item.id,
      name: item.name || '',
      title: item.title || item.name || 'Untitled',
      artist: item.artist || 'Local Media',
      type: item.type || 'audio',
      format: item.format || '',
      size: item.size || 0,
      duration: item.duration || 0,
      year: item.year || new Date().getFullYear(),
      genre: item.genre || 'Media',
      thumbnail: item.thumbnail || '',
      isLocal: Boolean(item.isLocal),
      hasStoredBlob: Boolean(item.hasStoredBlob),
      lastModified: item.lastModified || Date.now(),
      addedAt: item.addedAt || Date.now()
    };

    return this._put('library', record);
  }

  /**
   * Loads all library metadata records from IndexedDB.
   * @returns {Promise<Array<object>>}
   */
  async loadLibraryItems() {
    if (!this.isAvailable) return [];
    return this._getAll('library');
  }

  /**
   * Deletes a library item from metadata and any associated blob storage.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteLibraryItem(id) {
    if (!this.isAvailable || !id) return false;
    await this.deleteBlob(id);
    return this._delete('library', id);
  }

  // --------------------------------------------------------------------------
  // Playlist Operations
  // --------------------------------------------------------------------------

  /**
   * Saves or updates a playlist record.
   * @param {object} playlist { id, name, itemIds, createdAt, updatedAt }
   * @returns {Promise<boolean>}
   */
  async savePlaylist(playlist) {
    if (!this.isAvailable || !playlist || !playlist.id) return false;

    const record = {
      id: playlist.id,
      name: (playlist.name || 'Untitled Playlist').trim(),
      itemIds: Array.isArray(playlist.itemIds) ? [...playlist.itemIds] : [],
      createdAt: playlist.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    return this._put('playlists', record);
  }

  /**
   * Loads all playlists from IndexedDB.
   * @returns {Promise<Array<object>>}
   */
  async loadPlaylists() {
    if (!this.isAvailable) return [];
    return this._getAll('playlists');
  }

  /**
   * Deletes a playlist by ID (does not delete media items).
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deletePlaylist(id) {
    if (!this.isAvailable || !id) return false;
    return this._delete('playlists', id);
  }

  // --------------------------------------------------------------------------
  // Favourites Operations
  // --------------------------------------------------------------------------

  /**
   * Saves the entire set of favourite media IDs.
   * @param {Set<string> | Array<string>} favourites
   * @returns {Promise<boolean>}
   */
  async saveFavourites(favourites) {
    if (!this.isAvailable) return false;

    const favArray = Array.from(favourites);
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('favourites', 'readwrite');
        const store = tx.objectStore('favourites');

        // Clear existing and rewrite
        store.clear();
        favArray.forEach((mediaId) => {
          store.put({ mediaId, addedAt: Date.now() });
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        console.warn('[Storage] Error saving favourites:', err);
        resolve(false);
      }
    });
  }

  /**
   * Loads favourite media IDs from IndexedDB.
   * @returns {Promise<Set<string>>}
   */
  async loadFavourites() {
    if (!this.isAvailable) return new Set();
    const records = await this._getAll('favourites');
    return new Set(records.map((r) => r.mediaId));
  }

  // --------------------------------------------------------------------------
  // History / Recently Played Operations
  // --------------------------------------------------------------------------

  /**
   * Records or updates a play history entry for a media item.
   * @param {string} mediaId
   * @returns {Promise<boolean>}
   */
  async recordPlayHistory(mediaId) {
    if (!this.isAvailable || !mediaId) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('history', 'readwrite');
        const store = tx.objectStore('history');

        const getReq = store.get(mediaId);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          const playCount = existing ? (existing.playCount || 1) + 1 : 1;

          store.put({
            mediaId,
            playedAt: Date.now(),
            playCount
          });
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        console.warn('[Storage] Error recording history:', err);
        resolve(false);
      }
    });
  }

  /**
   * Loads recently played history sorted newest first (bounded to max 100).
   * @returns {Promise<Array<object>>}
   */
  async loadHistory(limit = 100) {
    if (!this.isAvailable) return [];

    const all = await this._getAll('history');
    return all.sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0)).slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Playback Queue Persistence
  // --------------------------------------------------------------------------

  /**
   * Saves active playback queue item IDs and current index.
   * @param {Array<string>} activeQueue
   * @param {number} currentIndex
   * @returns {Promise<boolean>}
   */
  async saveQueue(activeQueue, currentIndex = 0) {
    if (!this.isAvailable) return false;

    const record = {
      id: 'active_queue',
      itemIds: Array.isArray(activeQueue) ? [...activeQueue] : [],
      currentIndex: Math.max(0, currentIndex || 0),
      savedAt: Date.now()
    };

    return this._put('queue', record);
  }

  /**
   * Loads persisted queue state.
   * @returns {Promise<{ itemIds: Array<string>, currentIndex: number } | null>}
   */
  async loadQueue() {
    if (!this.isAvailable) return null;
    return this._get('queue', 'active_queue');
  }

  // --------------------------------------------------------------------------
  // Optional Media Blob Store (Offline Browser Persistence)
  // --------------------------------------------------------------------------

  /**
   * Stores a local media file as a Blob in IndexedDB for permanent offline access.
   * @param {string} id
   * @param {Blob | File} blob
   * @param {string} mimeType
   * @param {string} name
   * @param {number} size
   * @returns {Promise<boolean>}
   */
  async saveBlob(id, blob, mimeType, name, size) {
    if (!this.isAvailable || !id || !blob) return false;

    const record = {
      id,
      blob,
      mimeType: mimeType || blob.type || '',
      name: name || '',
      size: size || blob.size || 0,
      savedAt: Date.now()
    };

    return this._put('blobs', record);
  }

  /**
   * Retrieves a stored Blob by media ID.
   * @param {string} id
   * @returns {Promise<Blob | null>}
   */
  async getBlob(id) {
    if (!this.isAvailable || !id) return null;
    const record = await this._get('blobs', id);
    return record ? record.blob : null;
  }

  /**
   * Deletes a stored Blob by media ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteBlob(id) {
    if (!this.isAvailable || !id) return false;
    return this._delete('blobs', id);
  }

  // --------------------------------------------------------------------------
  // LocalStorage Preferences
  // --------------------------------------------------------------------------

  /**
   * Loads user preferences from localStorage.
   * @returns {object}
   */
  loadPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return this._getDefaultPreferences();
      const parsed = JSON.parse(raw);
      return { ...this._getDefaultPreferences(), ...parsed };
    } catch (err) {
      console.warn('[Storage] Error reading preferences from localStorage:', err);
      return this._getDefaultPreferences();
    }
  }

  /**
   * Saves user preferences to localStorage.
   * @param {object} prefs
   */
  savePreferences(prefs) {
    try {
      const current = this.loadPreferences();
      const updated = { ...current, ...prefs, updatedAt: Date.now() };
      localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[Storage] Error saving preferences to localStorage:', err);
    }
  }

  _getDefaultPreferences() {
    return {
      version: 1,
      volume: 0.85,
      isMuted: false,
      playbackRate: 1.0,
      repeatMode: 'all',
      shuffleEnabled: false,
      sortKey: 'date',
      sortDir: 'desc',
      filterType: 'all',
      currentView: 'home',
      storeBlobsByDefault: false
    };
  }

  // --------------------------------------------------------------------------
  // Generic IndexedDB Helper Methods
  // --------------------------------------------------------------------------

  _put(storeName, record) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(record);

        tx.oncomplete = () => resolve(true);
        tx.onerror = (err) => {
          console.warn(`[Storage] Error putting record in ${storeName}:`, err);
          resolve(false);
        };
      } catch (err) {
        console.warn(`[Storage] Exception putting record in ${storeName}:`, err);
        resolve(false);
      }
    });
  }

  _get(storeName, key) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  _getAll(storeName) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  _delete(storeName, key) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }
}

export const storage = new StorageAdapter();
