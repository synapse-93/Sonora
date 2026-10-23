/**
 * Sonora — Playlist & Queue Manager (Phase 3)
 * Implements Playlist CRUD, Queue reordering, track progression algorithms, and persistence synchronization.
 * Adheres strictly to ARCHITECTURE.md Section 2.8 and Phase 3 requirements.
 */

import { getState, setState } from './state.js';
import { storage } from './storage.js';
import { generateId } from './utils.js';

class PlaylistManager {
  /**
   * Creates a new playlist with validation.
   * @param {string} rawName
   * @param {Array<string>} initialTrackIds
   * @returns {Promise<object>} The created playlist record
   */
  async createPlaylist(rawName, initialTrackIds = []) {
    const name = (rawName || '').trim();
    if (!name) {
      throw new Error('Playlist name cannot be empty.');
    }

    const { playlists } = getState();

    // Check for exact duplicates and handle gracefully
    let finalName = name;
    const existingNames = Array.from(playlists.values()).map(p => p.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      let count = 2;
      while (existingNames.includes(`${name} (${count})`.toLowerCase())) {
        count++;
      }
      finalName = `${name} (${count})`;
    }

    const id = generateId('pl');
    const newPlaylist = {
      id,
      name: finalName,
      itemIds: Array.isArray(initialTrackIds) ? [...initialTrackIds] : [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Update state map immutably
    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.set(id, newPlaylist);
    setState({ playlists: updatedPlaylists });

    // Persist to IndexedDB
    await storage.savePlaylist(newPlaylist);

    return newPlaylist;
  }

  /**
   * Renames an existing playlist with validation.
   * @param {string} playlistId
   * @param {string} rawNewName
   * @returns {Promise<object>}
   */
  async renamePlaylist(playlistId, rawNewName) {
    const newName = (rawNewName || '').trim();
    if (!newName) {
      throw new Error('Playlist name cannot be empty.');
    }

    const { playlists } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist) {
      throw new Error('Playlist not found.');
    }

    const updated = {
      ...playlist,
      name: newName,
      updatedAt: Date.now()
    };

    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.set(playlistId, updated);
    setState({ playlists: updatedPlaylists });

    await storage.savePlaylist(updated);
    return updated;
  }

  /**
   * Deletes a playlist by ID. Does NOT delete the underlying media items.
   * @param {string} playlistId
   * @returns {Promise<boolean>}
   */
  async deletePlaylist(playlistId) {
    const { playlists, activePlaylistId } = getState();
    if (!playlists.has(playlistId)) return false;

    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.delete(playlistId);

    const updates = { playlists: updatedPlaylists };
    if (activePlaylistId === playlistId) {
      updates.activePlaylistId = null;
      updates.currentView = 'playlists';
    }

    setState(updates);
    await storage.deletePlaylist(playlistId);
    return true;
  }

  /**
   * Adds a track to a playlist if not already present.
   * @param {string} playlistId
   * @param {string} mediaId
   * @returns {Promise<boolean>}
   */
  async addTrackToPlaylist(playlistId, mediaId) {
    const { playlists } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist) return false;

    if (playlist.itemIds.includes(mediaId)) {
      return false; // Already in playlist
    }

    const updated = {
      ...playlist,
      itemIds: [...playlist.itemIds, mediaId],
      updatedAt: Date.now()
    };

    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.set(playlistId, updated);
    setState({ playlists: updatedPlaylists });

    await storage.savePlaylist(updated);
    return true;
  }

  /**
   * Removes a track from a playlist.
   * @param {string} playlistId
   * @param {string} mediaId
   * @returns {Promise<boolean>}
   */
  async removeTrackFromPlaylist(playlistId, mediaId) {
    const { playlists } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist) return false;

    const updated = {
      ...playlist,
      itemIds: playlist.itemIds.filter(id => id !== mediaId),
      updatedAt: Date.now()
    };

    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.set(playlistId, updated);
    setState({ playlists: updatedPlaylists });

    await storage.savePlaylist(updated);
    return true;
  }

  /**
   * Reorders tracks within a playlist.
   * @param {string} playlistId
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {Promise<boolean>}
   */
  async reorderPlaylistTracks(playlistId, fromIndex, toIndex) {
    const { playlists } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist) return false;

    const itemIds = [...playlist.itemIds];
    if (fromIndex < 0 || fromIndex >= itemIds.length || toIndex < 0 || toIndex >= itemIds.length) {
      return false;
    }

    const [movedItem] = itemIds.splice(fromIndex, 1);
    itemIds.splice(toIndex, 0, movedItem);

    const updated = {
      ...playlist,
      itemIds,
      updatedAt: Date.now()
    };

    const updatedPlaylists = new Map(playlists);
    updatedPlaylists.set(playlistId, updated);
    setState({ playlists: updatedPlaylists });

    await storage.savePlaylist(updated);
    return true;
  }

  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------

  /**
   * Adds an item to the end of the active playback queue.
   * @param {string} mediaId
   * @returns {boolean}
   */
  addToQueue(mediaId) {
    const { activeQueue } = getState();
    if (!mediaId || activeQueue.includes(mediaId)) return false;

    const updatedQueue = [...activeQueue, mediaId];
    setState({ activeQueue: updatedQueue });
    storage.saveQueue(updatedQueue);
    return true;
  }

  /**
   * Removes an individual item from the active queue.
   * @param {string} mediaId
   * @returns {boolean}
   */
  removeFromQueue(mediaId) {
    const { activeQueue } = getState();
    const updatedQueue = activeQueue.filter(id => id !== mediaId);

    setState({ activeQueue: updatedQueue });
    storage.saveQueue(updatedQueue);
    return true;
  }

  /**
   * Clears all items from the active queue.
   */
  clearQueue() {
    setState({ activeQueue: [] });
    storage.saveQueue([]);
  }

  /**
   * Moves a queue item up or down in the sequence.
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {boolean}
   */
  reorderQueue(fromIndex, toIndex) {
    const { activeQueue } = getState();
    if (fromIndex < 0 || fromIndex >= activeQueue.length || toIndex < 0 || toIndex >= activeQueue.length) {
      return false;
    }

    const updated = [...activeQueue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    setState({ activeQueue: updated });
    storage.saveQueue(updated);
    return true;
  }

  /**
   * Loads a playlist into the active playback queue.
   * @param {string} playlistId
   * @param {number} startIndex
   * @returns {string | null} Target track ID to begin playback
   */
  playPlaylist(playlistId, startIndex = 0) {
    const { playlists } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist || playlist.itemIds.length === 0) return null;

    const newQueue = [...playlist.itemIds];
    const targetTrackId = newQueue[startIndex] || newQueue[0];

    setState({
      activeQueue: newQueue,
      selectedMediaId: targetTrackId
    });
    storage.saveQueue(newQueue);

    return targetTrackId;
  }

  /**
   * Appends all tracks of a playlist into the existing queue.
   * @param {string} playlistId
   * @returns {number} Number of tracks added
   */
  appendPlaylistToQueue(playlistId) {
    const { playlists, activeQueue } = getState();
    const playlist = playlists.get(playlistId);
    if (!playlist) return 0;

    let addedCount = 0;
    const newQueue = [...activeQueue];

    playlist.itemIds.forEach(id => {
      if (!newQueue.includes(id)) {
        newQueue.push(id);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setState({ activeQueue: newQueue });
      storage.saveQueue(newQueue);
    }

    return addedCount;
  }

  /**
   * Resolves the next track in the queue based on repeat and shuffle modes.
   * @param {string} currentTrackId
   * @returns {string | null}
   */
  getNextTrack(currentTrackId) {
    const { activeQueue, repeatMode, shuffleEnabled } = getState();
    if (!activeQueue || activeQueue.length === 0) return null;

    if (shuffleEnabled && activeQueue.length > 1) {
      const candidates = activeQueue.filter(id => id !== currentTrackId);
      const randomIndex = Math.floor(Math.random() * candidates.length);
      return candidates[randomIndex];
    }

    const currentIndex = activeQueue.indexOf(currentTrackId);
    if (currentIndex === -1) return activeQueue[0];

    const nextIndex = currentIndex + 1;
    if (nextIndex < activeQueue.length) {
      return activeQueue[nextIndex];
    }

    // End of queue reached
    if (repeatMode === 'all') {
      return activeQueue[0];
    }

    return null; // Queue ended, no loop
  }

  /**
   * Resolves the previous track in the queue.
   * @param {string} currentTrackId
   * @returns {string | null}
   */
  getPreviousTrack(currentTrackId) {
    const { activeQueue, repeatMode } = getState();
    if (!activeQueue || activeQueue.length === 0) return null;

    const currentIndex = activeQueue.indexOf(currentTrackId);
    if (currentIndex === -1 || currentIndex === 0) {
      return repeatMode === 'all' ? activeQueue[activeQueue.length - 1] : activeQueue[0];
    }

    return activeQueue[currentIndex - 1];
  }
}

export const playlistManager = new PlaylistManager();
