/**
 * Sonora — Application Orchestrator (Phase 3: Library, Playlists & Persistence)
 * Coordinates UI state, views, IndexedDB persistence, file importing, playlists,
 * favourites, queue management, recently played history, and offline file re-linking.
 * Adheres strictly to ARCHITECTURE.md and Phase 3 requirements.
 */

import { getState, setState, setPlaybackState, subscribe } from './state.js';
import { SAMPLE_MEDIA_ITEMS } from './sample-data.js';
import { formatTime, formatBytes, debounce, escapeHtml, generateId } from './utils.js';
import { processFiles, findExistingMatch, relinkMediaItem, createBlobUrl } from './file-handler.js';
import { mediaEngine } from './media-engine.js';
import { playerControls } from './player-controls.js';
import { keyboardController } from './keyboard.js';
import { storage } from './storage.js';
import { playlistManager } from './playlist.js';

// Cached DOM Elements
const DOM = {
  // Navigation
  sidebar: document.getElementById('sidebar'),
  btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
  navButtons: document.querySelectorAll('.sn-nav-item[data-view]'),
  badgeLibrary: document.getElementById('nav-badge-library'),
  badgePlaylists: document.getElementById('nav-badge-playlists'),
  badgeFavourites: document.getElementById('nav-badge-favourites'),
  badgeRecent: document.getElementById('nav-badge-recent'),

  // Header, Search, Ingestion & Sorting
  searchInput: document.getElementById('search-input'),
  btnSearchClear: document.getElementById('btn-search-clear'),
  btnImportMedia: document.getElementById('btn-import-media'),
  fileInputMedia: document.getElementById('file-input-media'),
  dragOverlay: document.getElementById('drag-overlay'),
  sortSelect: document.getElementById('sort-select'),
  sortWrap: document.getElementById('sort-wrap'),

  // Hero Canvas
  heroCanvas: document.getElementById('hero-canvas'),
  heroBackdrop: document.getElementById('hero-backdrop'),
  heroArtContainer: document.getElementById('hero-art-container'),
  heroArtImg: document.getElementById('hero-art-img'),
  heroTypeBadge: document.getElementById('hero-type-badge'),
  heroFormatBadge: document.getElementById('hero-format-badge'),
  heroDurationBadge: document.getElementById('hero-duration-badge'),
  heroSizeBadge: document.getElementById('hero-size-badge'),
  heroTitle: document.getElementById('hero-title'),
  heroArtist: document.getElementById('hero-artist'),
  heroDesc: document.getElementById('hero-desc'),
  btnHeroPlay: document.getElementById('btn-hero-play'),
  btnHeroQueue: document.getElementById('btn-hero-queue'),
  btnHeroFav: document.getElementById('btn-hero-fav'),

  // Native HTML5 Media Elements
  nativeAudio: document.getElementById('sn-native-audio'),
  nativeVideo: document.getElementById('sn-native-video'),

  // Catalog Section
  catalogTitle: document.getElementById('catalog-title'),
  catalogSubtitle: document.getElementById('catalog-subtitle'),
  filterPills: document.querySelectorAll('.sn-filter-pill'),
  cardGrid: document.getElementById('card-grid'),
  emptyState: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-state-title'),
  emptyDesc: document.getElementById('empty-state-desc'),
  btnEmptyReset: document.getElementById('btn-empty-reset'),

  // Queue Drawer
  queueDrawer: document.getElementById('queue-drawer'),
  btnQueueToggle: document.getElementById('btn-queue-toggle'),
  btnQueueClose: document.getElementById('btn-queue-close'),
  btnQueueClear: document.getElementById('btn-queue-clear'),
  queueBody: document.getElementById('queue-body'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  queueHeaderCount: document.getElementById('queue-header-count'),
  playerQueueBadge: document.getElementById('player-queue-badge'),

  // Bottom Player Bar
  playerThumbImg: document.getElementById('player-thumb-img'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  playerTimeCurrent: document.getElementById('player-time-current'),
  playerTimeDuration: document.getElementById('player-time-duration'),
  playerScrubber: document.getElementById('player-scrubber'),
  btnPlayerPlay: document.getElementById('btn-player-play'),
  playerPlayIcon: document.getElementById('player-play-icon'),
  btnPlayerPrev: document.getElementById('btn-player-prev'),
  btnPlayerNext: document.getElementById('btn-player-next'),
  btnPlayerReplay: document.getElementById('btn-player-replay'),
  btnPlayerSkip: document.getElementById('btn-player-skip'),
  btnPlayerMute: document.getElementById('btn-player-mute'),
  playerVolume: document.getElementById('player-volume'),
  playerSpeedBtn: document.getElementById('player-speed-btn'),
  btnPlayerFav: document.getElementById('btn-player-fav'),

  // Modal Dialog Container
  modalContainer: document.getElementById('modal-container'),
  modalDialog: document.getElementById('modal-dialog'),

  // Backdrop
  backdrop: document.getElementById('backdrop')
};

/**
 * Initializes the application, restores persisted data, and establishes subscriptions.
 */
async function init() {
  console.log('[App] Bootstrapping Sonora Phase 3...');

  // 1. Initialize IndexedDB Persistence Layer
  const isDbReady = await storage.initDB();
  if (!isDbReady) {
    showNotification('IndexedDB unavailable. Running in session memory mode.', true);
  }

  // 2. Load User Preferences from localStorage
  const prefs = storage.loadPreferences();
  if (DOM.sortSelect) {
    DOM.sortSelect.value = `${prefs.sortKey || 'date'}-${prefs.sortDir || 'desc'}`;
  }

  // 3. Restore Persisted Data from IndexedDB
  const storedItems = await storage.loadLibraryItems();
  const storedPlaylists = await storage.loadPlaylists();
  const storedFavourites = await storage.loadFavourites();
  const storedHistory = await storage.loadHistory(100);
  const storedQueueRecord = await storage.loadQueue();

  // 4. Resolve Library Media Items
  const itemsMap = new Map();

  if (storedItems.length === 0) {
    // Seed initial presentation fixtures on fresh start
    for (const item of SAMPLE_MEDIA_ITEMS) {
      itemsMap.set(item.id, item);
      await storage.saveLibraryItem(item);
    }
  } else {
    // Restore items and handle offline status for local files
    for (const record of storedItems) {
      const item = { ...record };

      if (item.isLocal) {
        // Check if file blob was saved in IndexedDB blobs store
        const blob = await storage.getBlob(item.id);
        if (blob) {
          item.file = blob;
          item.objectUrl = createBlobUrl(blob);
          item.isOffline = false;
          item.hasStoredBlob = true;
        } else {
          // Normal local file import: browser security prevents reading file after reload
          // Mark as offline until re-imported or re-linked
          item.isOffline = true;
          item.file = null;
          item.objectUrl = null;
        }
      }

      itemsMap.set(item.id, item);
    }
  }

  // 5. Resolve Playlists
  const playlistsMap = new Map();
  if (storedPlaylists.length > 0) {
    storedPlaylists.forEach(pl => playlistsMap.set(pl.id, pl));
  } else {
    // Default starter playlist
    const defaultPl = {
      id: 'pl_favorites',
      name: 'Curated Highlights',
      itemIds: ['trk_01', 'trk_02', 'trk_04'].filter(id => itemsMap.has(id)),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    playlistsMap.set(defaultPl.id, defaultPl);
    await storage.savePlaylist(defaultPl);
  }

  // 6. Resolve Favourites
  let favouritesSet = storedFavourites;
  if (!favouritesSet || favouritesSet.size === 0) {
    favouritesSet = new Set(['trk_01', 'trk_04'].filter(id => itemsMap.has(id)));
    await storage.saveFavourites(favouritesSet);
  }

  // 7. Resolve Queue
  let initialQueue = [];
  if (storedQueueRecord && Array.isArray(storedQueueRecord.itemIds) && storedQueueRecord.itemIds.length > 0) {
    initialQueue = storedQueueRecord.itemIds.filter(id => itemsMap.has(id));
  }
  if (initialQueue.length === 0) {
    initialQueue = ['trk_01', 'trk_02', 'trk_04'].filter(id => itemsMap.has(id));
  }

  const initialSelectedId = initialQueue[0] || Array.from(itemsMap.keys())[0] || null;

  // 8. Commit Initial State
  setState({
    items: itemsMap,
    playlists: playlistsMap,
    favourites: favouritesSet,
    history: storedHistory || [],
    activeQueue: initialQueue,
    selectedMediaId: initialSelectedId,
    sortKey: prefs.sortKey || 'date',
    sortDir: prefs.sortDir || 'desc',
    repeatMode: prefs.repeatMode || 'all',
    shuffleEnabled: prefs.shuffleEnabled || false,
    currentView: prefs.currentView || 'home'
  });

  // 9. Initialize Native Media Engine
  mediaEngine.init({
    audioElement: DOM.nativeAudio,
    videoElement: DOM.nativeVideo
  });

  // Engine Event Hooks
  mediaEngine.onTrackEnded(() => {
    playNextTrack(true);
  });

  mediaEngine.onError((msg) => {
    showNotification(msg, true);
  });

  // Recently Played Tracker: Records playback only when genuinely started
  mediaEngine.on('playing', async (data) => {
    if (data && data.trackId) {
      await storage.recordPlayHistory(data.trackId);
      const updatedHistory = await storage.loadHistory(100);
      setState({ history: updatedHistory });
    }
  });

  // 10. Initialize Custom Player Controls
  playerControls.init(
    {
      btnPlay: DOM.btnPlayerPlay,
      btnHeroPlay: DOM.btnHeroPlay,
      playIcon: DOM.playerPlayIcon,
      btnPrev: DOM.btnPlayerPrev,
      btnNext: DOM.btnPlayerNext,
      btnReplay: DOM.btnPlayerReplay,
      btnSkip: DOM.btnPlayerSkip,
      scrubber: DOM.playerScrubber,
      timeCurrent: DOM.playerTimeCurrent,
      timeDuration: DOM.playerTimeDuration,
      volumeSlider: DOM.playerVolume,
      btnMute: DOM.btnPlayerMute,
      speedBadge: DOM.playerSpeedBtn
    },
    mediaEngine,
    {
      onNext: () => playNextTrack(false),
      onPrev: () => playPrevTrack(),
      onPlayRequest: () => handlePlayCurrentItem()
    }
  );

  // 11. Initialize Keyboard Shortcuts
  keyboardController.init(mediaEngine, {
    onNext: () => playNextTrack(false),
    onPrev: () => playPrevTrack()
  });

  // 12. Setup UI Events, Drag-and-Drop, and Subscriptions
  bindEvents();
  setupDragAndDrop();
  setupSubscriptions();

  // 13. Initial Render
  updateHeroPreview(initialSelectedId);
  updatePlayerBarPreview(initialSelectedId);
  renderCatalog();
  renderQueue();
  updateBadges();

  console.log('Sonora Phase 3 (Library, Playlists & Persistence) initialized successfully.');
}

/**
 * Binds UI interaction event listeners.
 */
function bindEvents() {
  // Sidebar Navigation Items
  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) {
        setState({ currentView: view, isSidebarOpen: false });
        storage.savePreferences({ currentView: view });
      }
    });
  });

  // Sidebar Mobile Toggle
  DOM.btnSidebarToggle?.addEventListener('click', () => {
    const { isSidebarOpen } = getState();
    setState({ isSidebarOpen: !isSidebarOpen, isQueueOpen: false });
  });

  // Backdrop Click (Closes drawers and modals)
  DOM.backdrop?.addEventListener('click', () => {
    const { activeModal } = getState();
    if (activeModal) {
      closeModal();
    } else {
      setState({ isSidebarOpen: false, isQueueOpen: false });
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const { isSidebarOpen, isQueueOpen, activeModal } = getState();
      if (activeModal) {
        closeModal();
      } else if (isSidebarOpen || isQueueOpen) {
        setState({ isSidebarOpen: false, isQueueOpen: false });
      }
    } else if (e.key === '/' && document.activeElement !== DOM.searchInput && !getState().activeModal) {
      e.preventDefault();
      DOM.searchInput?.focus();
    }
  });

  // Search Input
  DOM.searchInput?.addEventListener('input', debounce((e) => {
    const query = e.target.value.trim();
    setState({ searchQuery: query });
    DOM.btnSearchClear?.classList.toggle('visible', query.length > 0);
  }, 150));

  DOM.btnSearchClear?.addEventListener('click', () => {
    if (DOM.searchInput) DOM.searchInput.value = '';
    DOM.btnSearchClear?.classList.remove('visible');
    setState({ searchQuery: '' });
    DOM.searchInput?.focus();
  });

  // Filter Pills (All / Audio / Video)
  DOM.filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter || 'all';
      setState({ filterType: filter });
      storage.savePreferences({ filterType: filter });
    });
  });

  // Sort Dropdown
  DOM.sortSelect?.addEventListener('change', (e) => {
    const [sortKey, sortDir] = e.target.value.split('-');
    setState({ sortKey, sortDir });
    storage.savePreferences({ sortKey, sortDir });
  });

  // Reset Filters in Empty State
  DOM.btnEmptyReset?.addEventListener('click', () => {
    if (DOM.searchInput) DOM.searchInput.value = '';
    DOM.btnSearchClear?.classList.remove('visible');
    setState({ searchQuery: '', filterType: 'all', currentView: 'library' });
  });

  // File Picker Import Button
  DOM.btnImportMedia?.addEventListener('click', () => {
    DOM.fileInputMedia?.click();
  });

  DOM.fileInputMedia?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
      DOM.fileInputMedia.value = '';
    }
  });

  // Hero Actions
  DOM.btnHeroQueue?.addEventListener('click', () => {
    const { selectedMediaId } = getState();
    if (!selectedMediaId) return;
    const added = playlistManager.addToQueue(selectedMediaId);
    if (added) {
      showNotification('Track added to play queue.');
    } else {
      showNotification('Track is already in queue.');
    }
  });

  DOM.btnHeroFav?.addEventListener('click', () => {
    const { selectedMediaId } = getState();
    if (selectedMediaId) toggleFavourite(selectedMediaId);
  });

  DOM.btnPlayerFav?.addEventListener('click', () => {
    const { selectedMediaId } = getState();
    if (selectedMediaId) toggleFavourite(selectedMediaId);
  });

  // Queue Drawer Controls
  DOM.btnQueueToggle?.addEventListener('click', () => {
    const { isQueueOpen } = getState();
    setState({ isQueueOpen: !isQueueOpen, isSidebarOpen: false });
  });

  DOM.btnQueueClose?.addEventListener('click', () => {
    setState({ isQueueOpen: false });
  });

  DOM.btnQueueClear?.addEventListener('click', () => {
    playlistManager.clearQueue();
    showNotification('Play queue cleared.');
  });
}

/**
 * Sets up drag-and-drop file ingestion across the entire browser viewport.
 */
function setupDragAndDrop() {
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      DOM.dragOverlay?.classList.add('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      DOM.dragOverlay?.classList.remove('active');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    DOM.dragOverlay?.classList.remove('active');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });
}

/**
 * Ingests files selected through picker or drag-and-drop with duplicate detection and re-linking.
 * @param {FileList | Array<File>} files
 */
async function handleFilesSelected(files) {
  const { accepted, rejected } = processFiles(files);

  if (accepted.length > 0) {
    const { items, activeQueue } = getState();
    const newItems = new Map(items);
    const newQueue = [...activeQueue];
    let relinkedCount = 0;
    let newlyAddedCount = 0;
    let firstActiveId = null;

    for (const item of accepted) {
      // Conservative Duplicate Detection: Check if file already exists in library
      const existingMatch = findExistingMatch(item.file, Array.from(items.values()));

      if (existingMatch) {
        // Re-link existing record in place (preserves playlists and favourites)
        relinkMediaItem(existingMatch, item.file);
        newItems.set(existingMatch.id, existingMatch);
        await storage.saveLibraryItem(existingMatch);
        relinkedCount++;
        if (!firstActiveId) firstActiveId = existingMatch.id;
      } else {
        // Brand new track
        newItems.set(item.id, item);
        if (!newQueue.includes(item.id)) {
          newQueue.push(item.id);
        }
        await storage.saveLibraryItem(item);
        newlyAddedCount++;
        if (!firstActiveId) firstActiveId = item.id;
      }
    }

    setState({
      items: newItems,
      activeQueue: newQueue,
      currentView: 'library'
    });
    storage.saveQueue(newQueue);

    if (firstActiveId) {
      loadAndPlayItem(firstActiveId, true);
    }

    let summaryMsg = '';
    if (newlyAddedCount > 0 && relinkedCount > 0) {
      summaryMsg = `Imported ${newlyAddedCount} new tracks, re-linked ${relinkedCount} existing tracks.`;
    } else if (newlyAddedCount > 0) {
      summaryMsg = `Imported ${newlyAddedCount} media file${newlyAddedCount > 1 ? 's' : ''}!`;
    } else {
      summaryMsg = `Re-linked ${relinkedCount} existing file${relinkedCount > 1 ? 's' : ''} in library.`;
    }

    showNotification(summaryMsg);
  }

  if (rejected.length > 0) {
    showNotification(rejected[0], true);
  }
}

/**
 * Loads a track into the media engine and optionally starts playing.
 * @param {string} id
 * @param {boolean} autoPlay
 */
async function loadAndPlayItem(id, autoPlay = false) {
  if (!id) return;
  const { items } = getState();
  const item = items.get(id);
  if (!item) return;

  setState({ selectedMediaId: id });

  // Handle missing/offline local media files safely
  if (item.isOffline) {
    showNotification(`"${item.title}" is offline. Re-link the file to play.`, true);
    openModal('relink_file', item);
    return;
  }

  // Handle presentation sample fixtures
  if (!item.isLocal && !item.file) {
    if (autoPlay) {
      showNotification('Sample item is a demo fixture. Click "Import" to play your local audio & video files.', false);
    }
    return;
  }

  // Load real media into engine
  try {
    await mediaEngine.load(item, autoPlay);
  } catch (err) {
    console.warn('[App] Playback error on load:', err);
    showNotification('Unable to decode or play media file.', true);
  }
}

/**
 * Handles play request for the currently selected item.
 */
function handlePlayCurrentItem() {
  const { selectedMediaId, items, playback } = getState();
  if (!selectedMediaId) {
    showNotification('No media item selected. Click Import to add files.', false);
    return;
  }

  const item = items.get(selectedMediaId);
  if (!item) return;

  if (item.isOffline) {
    showNotification(`"${item.title}" is offline. Re-link the file to play.`, true);
    openModal('relink_file', item);
    return;
  }

  if (!item.isLocal && !item.file) {
    showNotification('Sample item is a demo fixture. Click "Import" or drop your local audio/video files to play!', false);
    return;
  }

  if (playback.currentTrackId === item.id) {
    mediaEngine.togglePlay().catch((err) => {
      console.warn('Toggle play error:', err);
    });
  } else {
    loadAndPlayItem(item.id, true);
  }
}

/**
 * Plays the next track in the queue, handling repeat and shuffle algorithms.
 * @param {boolean} isAutoAdvance
 */
function playNextTrack(isAutoAdvance = false) {
  const { selectedMediaId, repeatMode } = getState();

  // Repeat One handler
  if (isAutoAdvance && repeatMode === 'one') {
    mediaEngine.seek(0);
    mediaEngine.play().catch(() => {});
    return;
  }

  const nextTrackId = playlistManager.getNextTrack(selectedMediaId);
  if (nextTrackId) {
    loadAndPlayItem(nextTrackId, true);
  } else if (isAutoAdvance) {
    // End of queue reached and repeatMode !== 'all'
    setPlaybackState({ status: 'ended' });
  }
}

/**
 * Plays the previous track in the queue.
 */
function playPrevTrack() {
  const { selectedMediaId } = getState();
  const prevTrackId = playlistManager.getPreviousTrack(selectedMediaId);
  if (prevTrackId) {
    loadAndPlayItem(prevTrackId, true);
  }
}

/**
 * Sets up state subscriptions for reactive rendering.
 */
function setupSubscriptions() {
  // Navigation View change
  subscribe('currentView', (view) => {
    DOM.navButtons.forEach(btn => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    renderCatalog();
  });

  // Search or Filter change
  subscribe('searchQuery', () => renderCatalog());
  subscribe('filterType', (filter) => {
    DOM.filterPills.forEach(pill => {
      const isActive = pill.dataset.filter === filter;
      pill.classList.toggle('active', isActive);
      pill.setAttribute('aria-checked', isActive.toString());
    });
    renderCatalog();
  });

  // Sorting change
  subscribe('sortKey', () => renderCatalog());
  subscribe('sortDir', () => renderCatalog());

  // Selected media item change
  subscribe('selectedMediaId', (id) => {
    updateHeroPreview(id);
    updatePlayerBarPreview(id);
    highlightSelectedCard(id);
    renderQueueActiveItem(id);
  });

  // Favourites change
  subscribe('favourites', () => {
    const { selectedMediaId, currentView } = getState();
    updateBadges();
    updateFavButtonStates(selectedMediaId);
    if (currentView === 'favourites') {
      renderCatalog();
    } else {
      renderCatalogCardFavIcons();
    }
  });

  // Playlists change
  subscribe('playlists', () => {
    const { currentView } = getState();
    updateBadges();
    if (currentView === 'playlists' || currentView === 'playlist-detail') {
      renderCatalog();
    }
  });

  // History change
  subscribe('history', () => {
    const { currentView } = getState();
    updateBadges();
    if (currentView === 'recent') {
      renderCatalog();
    }
  });

  // Queue change
  subscribe('activeQueue', () => {
    renderQueue();
    updateBadges();
  });

  // Drawer toggles
  subscribe('isQueueOpen', (isOpen) => {
    DOM.queueDrawer.classList.toggle('open', isOpen);
    DOM.queueDrawer.setAttribute('aria-hidden', (!isOpen).toString());
    DOM.btnQueueToggle.classList.toggle('active', isOpen);
    updateBackdrop();
  });

  subscribe('isSidebarOpen', (isOpen) => {
    DOM.sidebar.classList.toggle('open', isOpen);
    DOM.btnSidebarToggle?.setAttribute('aria-expanded', isOpen.toString());
    updateBackdrop();
  });
}

/**
 * Updates modal and drawer backdrop state.
 */
function updateBackdrop() {
  const { isQueueOpen, isSidebarOpen, activeModal } = getState();
  const shouldShow = isQueueOpen || isSidebarOpen || Boolean(activeModal);
  DOM.backdrop.classList.toggle('active', shouldShow);
  DOM.backdrop.setAttribute('aria-hidden', (!shouldShow).toString());
}

/**
 * Resolves sorted and filtered media items for display based on current view.
 * @returns {Array<object>}
 */
function getFilteredAndSortedItems() {
  const { currentView, filterType, searchQuery, sortKey, sortDir, items, favourites, history, activePlaylistId, playlists } = getState();
  let list = [];

  if (currentView === 'playlists') {
    return [];
  }

  if (currentView === 'playlist-detail') {
    const pl = playlists.get(activePlaylistId);
    if (!pl) return [];
    list = pl.itemIds.map(id => items.get(id)).filter(Boolean);
    // If user is searching within playlist, apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.artist && item.artist.toLowerCase().includes(q))
      );
    }
    return list;
  }

  if (currentView === 'favourites') {
    list = Array.from(items.values()).filter(item => favourites.has(item.id));
  } else if (currentView === 'recent') {
    const seen = new Set();
    const recentList = [];
    for (const h of history) {
      if (!seen.has(h.mediaId) && items.has(h.mediaId)) {
        seen.add(h.mediaId);
        recentList.push(items.get(h.mediaId));
      }
    }
    list = recentList;
  } else {
    // 'home' or 'library'
    list = Array.from(items.values());
  }

  // Filter by Type
  if (filterType !== 'all') {
    list = list.filter(item => item.type === filterType);
  }

  // Filter by Search Query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(item =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.artist && item.artist.toLowerCase().includes(q)) ||
      (item.genre && item.genre.toLowerCase().includes(q)) ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.filename && item.filename.toLowerCase().includes(q)) ||
      (item.format && item.format.toLowerCase().includes(q))
    );
  }

  // Sort: Only apply dynamic sorting to library, favourites, and home
  if (currentView !== 'recent') {
    list.sort((a, b) => {
      let comp = 0;
      if (sortKey === 'name' || sortKey === 'title') {
        comp = (a.title || a.name || '').localeCompare(b.title || b.name || '');
      } else if (sortKey === 'duration') {
        comp = (a.duration || 0) - (b.duration || 0);
      } else if (sortKey === 'size') {
        comp = (a.size || 0) - (b.size || 0);
      } else {
        // Date added
        comp = (a.addedAt || a.lastModified || 0) - (b.addedAt || b.lastModified || 0);
      }
      return sortDir === 'asc' ? comp : -comp;
    });
  }

  return list;
}

/**
 * Main catalog render dispatcher.
 */
function renderCatalog() {
  const { currentView } = getState();

  if (currentView === 'playlists') {
    renderPlaylistsView();
  } else if (currentView === 'playlist-detail') {
    renderPlaylistDetailView();
  } else {
    renderMediaCatalogView();
  }
}

/**
 * Renders the Media Cards Grid (Library, Favourites, Recent, Home).
 */
function renderMediaCatalogView() {
  const { currentView, searchQuery, items, favourites, selectedMediaId } = getState();
  const allCount = items.size;
  const filtered = getFilteredAndSortedItems();

  // Show Sort Controls in standard catalog views
  if (DOM.sortWrap) {
    DOM.sortWrap.style.display = currentView === 'recent' ? 'none' : 'flex';
  }

  // Set Section Headers
  if (currentView === 'favourites') {
    DOM.catalogTitle.textContent = 'Favourite Tracks';
    DOM.catalogSubtitle.textContent = `Showing ${filtered.length} saved favourite${filtered.length === 1 ? '' : 's'}`;
  } else if (currentView === 'recent') {
    DOM.catalogTitle.textContent = 'Recently Played';
    DOM.catalogSubtitle.textContent = `History of your ${filtered.length} most recent tracks`;
  } else if (currentView === 'home') {
    DOM.catalogTitle.textContent = 'Featured & Library Media';
    DOM.catalogSubtitle.textContent = `Showing ${filtered.length} of ${allCount} items`;
  } else {
    DOM.catalogTitle.textContent = 'Media Catalog';
    DOM.catalogSubtitle.textContent = `Showing ${filtered.length} of ${allCount} items`;
  }

  if (filtered.length === 0) {
    DOM.cardGrid.innerHTML = '';
    DOM.cardGrid.style.display = 'none';
    DOM.emptyState.style.display = 'flex';

    if (currentView === 'favourites') {
      DOM.emptyTitle.textContent = 'No Favourites Saved';
      DOM.emptyDesc.textContent = 'Click the heart icon on any media card to build your favourites collection.';
      DOM.btnEmptyReset.textContent = 'Browse All Media';
    } else if (currentView === 'recent') {
      DOM.emptyTitle.textContent = 'No Playback History';
      DOM.emptyDesc.textContent = 'Tracks will appear here automatically when genuine playback begins.';
      DOM.btnEmptyReset.textContent = 'Explore Library';
    } else {
      DOM.emptyTitle.textContent = 'No Media Found';
      DOM.emptyDesc.textContent = searchQuery
        ? `No tracks match "${escapeHtml(searchQuery)}". Check your filters or spelling.`
        : 'Your library is currently empty. Click Import to add local audio and video files.';
      DOM.btnEmptyReset.textContent = 'Reset Filters';
    }
    return;
  }

  DOM.emptyState.style.display = 'none';
  DOM.cardGrid.style.display = 'grid';

  DOM.cardGrid.innerHTML = filtered.map(item => {
    const isSelected = item.id === selectedMediaId;
    const isFav = favourites.has(item.id);
    const isVideo = item.type === 'video';

    return `
      <article
        class="sn-media-card ${isSelected ? 'selected' : ''} ${item.isOffline ? 'offline' : ''}"
        data-id="${item.id}"
        tabindex="0"
        role="button"
        aria-label="Select track: ${escapeHtml(item.title)} by ${escapeHtml(item.artist)}"
      >
        <div class="sn-card-thumbnail-wrap">
          <img src="${item.thumbnail}" alt="${escapeHtml(item.title)} poster" class="sn-card-thumbnail" loading="lazy">
          <div class="sn-card-play-overlay" aria-hidden="true">
            <div class="sn-card-play-btn" data-tooltip="Play Media">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
          </div>
          <span class="sn-badge ${isVideo ? 'sn-badge-video' : 'sn-badge-audio'} sn-card-type-badge">
            ${item.type.toUpperCase()}
          </span>
          <span class="sn-card-duration-badge">${item.duration > 0 ? formatTime(item.duration) : '--:--'}</span>
        </div>

        <div class="sn-card-content">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
            <h3 class="sn-card-title">${escapeHtml(item.title)}</h3>
            ${item.isOffline ? `<button class="sn-badge-offline" data-relink-id="${item.id}" data-tooltip="Local file unavailable. Click to re-link.">Offline</button>` : ''}
            ${item.hasStoredBlob ? `<span class="sn-badge-saved" data-tooltip="Permanently cached in browser storage">Saved</span>` : ''}
          </div>
          <p class="sn-card-subtitle">${escapeHtml(item.artist)}</p>

          <div class="sn-card-footer">
            <span>${escapeHtml(item.genre || 'Media')}</span>
            <div class="sn-card-actions">
              <button
                class="sn-card-action-btn"
                data-add-playlist-id="${item.id}"
                data-tooltip="Add to Playlist"
                aria-label="Add to Playlist"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>

              <button
                class="sn-card-fav-btn ${isFav ? 'active' : ''}"
                data-fav-id="${item.id}"
                data-tooltip="${isFav ? 'Remove from favourites' : 'Add to favourites'}"
                aria-label="${isFav ? 'Remove from' : 'Add to'} favourites"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach Card Click Handlers
  DOM.cardGrid.querySelectorAll('.sn-media-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.sn-card-fav-btn') || e.target.closest('.sn-card-action-btn') || e.target.closest('.sn-badge-offline')) {
        return;
      }
      const id = card.dataset.id;
      if (id) {
        const isPlayBtn = Boolean(e.target.closest('.sn-card-play-btn') || e.target.closest('.sn-card-play-overlay'));
        loadAndPlayItem(id, isPlayBtn);
      }
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = card.dataset.id;
        if (id) loadAndPlayItem(id, true);
      }
    });
  });

  // Attach Favourite Buttons
  DOM.cardGrid.querySelectorAll('.sn-card-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.favId;
      if (id) toggleFavourite(id);
    });
  });

  // Attach Add-to-Playlist Buttons
  DOM.cardGrid.querySelectorAll('[data-add-playlist-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.addPlaylistId;
      const { items } = getState();
      const item = items.get(id);
      if (item) openModal('add_to_playlist', item);
    });
  });

  // Attach Re-link Buttons
  DOM.cardGrid.querySelectorAll('[data-relink-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.relinkId;
      const { items } = getState();
      const item = items.get(id);
      if (item) openModal('relink_file', item);
    });
  });
}

/**
 * Renders the Playlists Collection Grid.
 */
function renderPlaylistsView() {
  const { playlists } = getState();
  if (DOM.sortWrap) DOM.sortWrap.style.display = 'none';

  DOM.catalogTitle.textContent = 'Custom Playlists';
  DOM.catalogSubtitle.textContent = `${playlists.size} curated playlists saved in your local library`;
  DOM.emptyState.style.display = 'none';
  DOM.cardGrid.style.display = 'grid';

  const playlistCards = [
    // Create Playlist Card
    `
      <div class="sn-playlist-card sn-playlist-card-create" id="card-create-playlist" tabindex="0" role="button">
        <div class="sn-playlist-create-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <span style="font-weight: 600; font-size: var(--sn-text-sm);">Create New Playlist</span>
      </div>
    `,
    // Existing Playlists
    ...Array.from(playlists.values()).map(pl => `
      <article class="sn-playlist-card" data-pl-id="${pl.id}" tabindex="0" role="button">
        <div class="sn-playlist-thumb-wrap">
          <svg class="sn-playlist-thumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </div>
        <div class="sn-playlist-info">
          <h3 class="sn-playlist-name">${escapeHtml(pl.name)}</h3>
          <span class="sn-playlist-meta">${pl.itemIds.length} track${pl.itemIds.length === 1 ? '' : 's'}</span>
        </div>
      </article>
    `)
  ];

  DOM.cardGrid.innerHTML = playlistCards.join('');

  // Bind Create Playlist Card
  document.getElementById('card-create-playlist')?.addEventListener('click', () => {
    openModal('create_playlist');
  });

  // Bind Existing Playlist Card Clicks
  DOM.cardGrid.querySelectorAll('[data-pl-id]').forEach(card => {
    card.addEventListener('click', () => {
      const plId = card.dataset.plId;
      if (plId) {
        setState({ currentView: 'playlist-detail', activePlaylistId: plId });
      }
    });
  });
}

/**
 * Renders the Playlist Detail View (Header banner + Track Table).
 */
function renderPlaylistDetailView() {
  const { activePlaylistId, playlists, items } = getState();
  const playlist = playlists.get(activePlaylistId);

  if (!playlist) {
    setState({ currentView: 'playlists', activePlaylistId: null });
    return;
  }

  if (DOM.sortWrap) DOM.sortWrap.style.display = 'none';

  const tracks = playlist.itemIds.map(id => items.get(id)).filter(Boolean);
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  DOM.catalogTitle.textContent = playlist.name;
  DOM.catalogSubtitle.textContent = `${tracks.length} tracks • ${formatTime(totalDuration)} total duration`;
  DOM.emptyState.style.display = 'none';
  DOM.cardGrid.style.display = 'block';

  DOM.cardGrid.innerHTML = `
    <div class="sn-playlist-detail">
      <div class="sn-playlist-header-card">
        <div class="sn-playlist-detail-art">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </div>
        <div class="sn-playlist-detail-meta">
          <span class="sn-playlist-detail-tag">Playlist</span>
          <h1 class="sn-playlist-detail-title">${escapeHtml(playlist.name)}</h1>
          <p class="sn-playlist-detail-sub">${tracks.length} tracks • ${formatTime(totalDuration)}</p>

          <div class="sn-playlist-actions">
            <button class="sn-btn sn-btn-primary" id="btn-pl-play-all" ${tracks.length === 0 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Play Playlist</span>
            </button>

            <button class="sn-btn sn-btn-secondary" id="btn-pl-queue-all" ${tracks.length === 0 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add to Queue</span>
            </button>

            <button class="sn-btn sn-btn-secondary" id="btn-pl-rename">
              <span>Rename</span>
            </button>

            <button class="sn-btn sn-btn-secondary" id="btn-pl-delete" style="color: var(--sn-rose-accent);">
              <span>Delete</span>
            </button>

            <button class="sn-btn sn-btn-secondary" id="btn-pl-back">
              <span>← All Playlists</span>
            </button>
          </div>
        </div>
      </div>

      ${tracks.length === 0 ? `
        <div class="sn-empty-state" style="display: flex; margin: 40px auto;">
          <div class="sn-empty-title">This Playlist is Empty</div>
          <div class="sn-empty-desc">Add tracks from your library by clicking the playlist icon on any media card.</div>
        </div>
      ` : `
        <table class="sn-track-table">
          <thead>
            <tr>
              <th style="width: 44px; text-align: center;">#</th>
              <th>Title</th>
              <th style="text-align: right; padding-right: 18px;">Duration</th>
              <th style="text-align: right; width: 140px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tracks.map((track, idx) => `
              <tr class="sn-track-row" data-track-id="${track.id}">
                <td class="sn-track-cell" style="text-align: center;">${idx + 1}</td>
                <td class="sn-track-cell">
                  <div class="sn-track-title-cell">
                    <div class="sn-track-cell-thumb">
                      <img src="${track.thumbnail}" alt="${escapeHtml(track.title)}">
                    </div>
                    <div class="sn-track-names">
                      <span class="sn-track-name-title">${escapeHtml(track.title)}</span>
                      <span class="sn-track-name-artist">${escapeHtml(track.artist)}</span>
                    </div>
                  </div>
                </td>
                <td class="sn-track-cell" style="text-align: right; font-family: var(--sn-font-mono); font-size: var(--sn-text-xs); color: var(--sn-text-muted);">
                  ${track.duration > 0 ? formatTime(track.duration) : '--:--'}
                </td>
                <td class="sn-track-cell">
                  <div class="sn-track-actions">
                    <button class="sn-queue-move-btn" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''} data-tooltip="Move Up">↑</button>
                    <button class="sn-queue-move-btn" data-move-down="${idx}" ${idx === tracks.length - 1 ? 'disabled' : ''} data-tooltip="Move Down">↓</button>
                    <button class="sn-queue-remove-btn" data-remove-pl-track="${track.id}" data-tooltip="Remove from playlist">×</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  // Bind Actions
  document.getElementById('btn-pl-back')?.addEventListener('click', () => {
    setState({ currentView: 'playlists', activePlaylistId: null });
  });

  document.getElementById('btn-pl-play-all')?.addEventListener('click', () => {
    const startId = playlistManager.playPlaylist(activePlaylistId);
    if (startId) loadAndPlayItem(startId, true);
  });

  document.getElementById('btn-pl-queue-all')?.addEventListener('click', () => {
    const count = playlistManager.appendPlaylistToQueue(activePlaylistId);
    showNotification(`Added ${count} track${count === 1 ? '' : 's'} to queue.`);
  });

  document.getElementById('btn-pl-rename')?.addEventListener('click', () => {
    openModal('rename_playlist', playlist);
  });

  document.getElementById('btn-pl-delete')?.addEventListener('click', async () => {
    if (confirm(`Delete playlist "${playlist.name}"? Media files will not be deleted.`)) {
      await playlistManager.deletePlaylist(playlist.id);
      showNotification(`Deleted playlist "${playlist.name}".`);
    }
  });

  // Track Row Click to Play
  DOM.cardGrid.querySelectorAll('.sn-track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.sn-queue-move-btn') || e.target.closest('.sn-queue-remove-btn')) return;
      const trackId = row.dataset.trackId;
      if (trackId) loadAndPlayItem(trackId, true);
    });
  });

  // Reorder Up
  DOM.cardGrid.querySelectorAll('[data-move-up]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.moveUp, 10);
      await playlistManager.reorderPlaylistTracks(activePlaylistId, idx, idx - 1);
      renderPlaylistDetailView();
    });
  });

  // Reorder Down
  DOM.cardGrid.querySelectorAll('[data-move-down]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.moveDown, 10);
      await playlistManager.reorderPlaylistTracks(activePlaylistId, idx, idx + 1);
      renderPlaylistDetailView();
    });
  });

  // Remove track from playlist
  DOM.cardGrid.querySelectorAll('[data-remove-pl-track]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const trackId = btn.dataset.removePlTrack;
      await playlistManager.removeTrackFromPlaylist(activePlaylistId, trackId);
      renderPlaylistDetailView();
    });
  });
}

/**
 * Highlights active selected card in the catalog grid.
 */
function highlightSelectedCard(id) {
  DOM.cardGrid.querySelectorAll('.sn-media-card').forEach(card => {
    const isSelected = card.dataset.id === id;
    card.classList.toggle('selected', isSelected);
  });
}

/**
 * Updates favourite icon fill/stroke across cards without complete re-render.
 */
function renderCatalogCardFavIcons() {
  const { favourites } = getState();
  DOM.cardGrid.querySelectorAll('.sn-card-fav-btn').forEach(btn => {
    const id = btn.dataset.favId;
    const isFav = favourites.has(id);
    btn.classList.toggle('active', isFav);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  });
}

/**
 * Updates hero preview canvas for selected media item.
 */
function updateHeroPreview(id) {
  if (!id) return;
  const { items } = getState();
  const item = items.get(id);
  if (!item) return;

  const isVideo = item.type === 'video';

  if (isVideo && item.isLocal && !item.isOffline) {
    DOM.heroArtContainer.classList.add('video-mode');
    DOM.heroArtImg.style.display = 'none';
    DOM.nativeVideo.style.display = 'block';
  } else {
    DOM.heroArtContainer.classList.remove('video-mode');
    DOM.heroArtImg.style.display = 'block';
    DOM.nativeVideo.style.display = 'none';
    DOM.heroArtImg.src = item.thumbnail;
    DOM.heroArtImg.alt = `${item.title} artwork`;
  }

  DOM.heroBackdrop.style.backgroundImage = `url("${item.thumbnail}")`;
  DOM.heroTypeBadge.textContent = item.type.toUpperCase();
  DOM.heroTypeBadge.className = `sn-badge ${isVideo ? 'sn-badge-video' : 'sn-badge-audio'}`;
  DOM.heroFormatBadge.textContent = item.format;
  DOM.heroDurationBadge.textContent = item.duration > 0 ? formatTime(item.duration) : '--:--';
  DOM.heroSizeBadge.textContent = formatBytes(item.size);

  DOM.heroTitle.textContent = item.title;
  DOM.heroArtist.innerHTML = `
    <span>${escapeHtml(item.artist)}</span>
    <span class="sn-text-muted">•</span>
    <span class="sn-text-muted">${escapeHtml(item.genre || 'Media')} (${item.year})</span>
  `;
  DOM.heroDesc.textContent = item.description || (item.isLocal ? 'Local media file ready for high-fidelity playback.' : '');

  updateFavButtonStates(id);
}

/**
 * Updates favourite button visual states across Hero and Playback Bar.
 */
function updateFavButtonStates(id) {
  const { favourites } = getState();
  const isFav = favourites.has(id);

  if (DOM.btnHeroFav) {
    DOM.btnHeroFav.classList.toggle('active', isFav);
    const heroSvg = DOM.btnHeroFav.querySelector('svg');
    if (heroSvg) heroSvg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }

  if (DOM.btnPlayerFav) {
    DOM.btnPlayerFav.classList.toggle('active', isFav);
    const playerSvg = DOM.btnPlayerFav.querySelector('svg');
    if (playerSvg) playerSvg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }
}

/**
 * Updates player bar with active track metadata.
 */
function updatePlayerBarPreview(id) {
  if (!id) return;
  const { items } = getState();
  const item = items.get(id);
  if (!item) return;

  DOM.playerThumbImg.src = item.thumbnail;
  DOM.playerThumbImg.alt = item.title;
  DOM.playerTitle.textContent = item.title;
  DOM.playerArtist.textContent = item.artist;
  DOM.playerTimeDuration.textContent = item.duration > 0 ? formatTime(item.duration) : '0:00';
  DOM.playerScrubber.max = item.duration > 0 ? item.duration : 100;
  DOM.playerScrubber.setAttribute('aria-valuemax', Math.floor(DOM.playerScrubber.max).toString());
}

/**
 * Toggles a track's favourite state and persists to IndexedDB.
 * @param {string} id
 */
async function toggleFavourite(id) {
  const { favourites } = getState();
  const newFavourites = new Set(favourites);

  if (newFavourites.has(id)) {
    newFavourites.delete(id);
    showNotification('Removed from favourites.');
  } else {
    newFavourites.add(id);
    showNotification('Added to favourites.');
  }

  setState({ favourites: newFavourites });
  await storage.saveFavourites(newFavourites);
}

/**
 * Renders the Queue Drawer with reordering buttons and remove controls.
 */
function renderQueue() {
  const { activeQueue, items, selectedMediaId } = getState();

  DOM.queueHeaderCount.textContent = activeQueue.length.toString();
  DOM.playerQueueBadge.style.display = activeQueue.length > 0 ? 'block' : 'none';

  if (activeQueue.length === 0) {
    DOM.queueBody.innerHTML = '';
    DOM.queueEmptyState.style.display = 'flex';
    return;
  }

  DOM.queueEmptyState.style.display = 'none';

  DOM.queueBody.innerHTML = activeQueue.map((id, index) => {
    const item = items.get(id);
    if (!item) return '';

    const isSelected = item.id === selectedMediaId;

    return `
      <div class="sn-queue-item ${isSelected ? 'active' : ''}" data-queue-id="${item.id}">
        <div class="sn-queue-thumb">
          <img src="${item.thumbnail}" alt="${escapeHtml(item.title)} thumbnail">
        </div>
        <div class="sn-queue-info">
          <span class="sn-queue-item-title">${escapeHtml(item.title)}</span>
          <span class="sn-queue-item-meta">${escapeHtml(item.artist)} • ${item.duration > 0 ? formatTime(item.duration) : '--:--'}</span>
        </div>
        <div class="sn-queue-item-actions">
          <button class="sn-queue-move-btn" data-queue-up="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move Up">↑</button>
          <button class="sn-queue-move-btn" data-queue-down="${index}" ${index === activeQueue.length - 1 ? 'disabled' : ''} aria-label="Move Down">↓</button>
          <button class="sn-queue-remove-btn" data-remove-id="${item.id}" aria-label="Remove from queue">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Queue item click to load and play
  DOM.queueBody.querySelectorAll('.sn-queue-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sn-queue-remove-btn') || e.target.closest('.sn-queue-move-btn')) return;
      const id = el.dataset.queueId;
      if (id) loadAndPlayItem(id, true);
    });
  });

  // Reorder Queue Up
  DOM.queueBody.querySelectorAll('[data-queue-up]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.queueUp, 10);
      playlistManager.reorderQueue(idx, idx - 1);
    });
  });

  // Reorder Queue Down
  DOM.queueBody.querySelectorAll('[data-queue-down]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.queueDown, 10);
      playlistManager.reorderQueue(idx, idx + 1);
    });
  });

  // Remove from queue
  DOM.queueBody.querySelectorAll('.sn-queue-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.removeId;
      if (id) playlistManager.removeFromQueue(id);
    });
  });
}

/**
 * Highlights currently playing item in the queue drawer.
 */
function renderQueueActiveItem(id) {
  DOM.queueBody.querySelectorAll('.sn-queue-item').forEach(item => {
    item.classList.toggle('active', item.dataset.queueId === id);
  });
}

/**
 * Updates sidebar badge counters.
 */
function updateBadges() {
  const { items, playlists, favourites, history } = getState();
  if (DOM.badgeLibrary) DOM.badgeLibrary.textContent = items.size.toString();
  if (DOM.badgePlaylists) DOM.badgePlaylists.textContent = playlists.size.toString();
  if (DOM.badgeFavourites) DOM.badgeFavourites.textContent = favourites.size.toString();
  if (DOM.badgeRecent) DOM.badgeRecent.textContent = history.length.toString();
}

/**
 * Modal Dialog Controller.
 * @param {'create_playlist' | 'rename_playlist' | 'add_to_playlist' | 'relink_file'} type
 * @param {any} data
 */
function openModal(type, data = null) {
  setState({ activeModal: type, modalData: data });
  if (!DOM.modalContainer || !DOM.modalDialog) return;

  if (type === 'create_playlist') {
    DOM.modalDialog.innerHTML = `
      <div class="sn-modal-header">
        <h2 class="sn-modal-title">Create New Playlist</h2>
        <button class="sn-modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="sn-modal-body">
        <label for="pl-name-input" style="font-size: var(--sn-text-xs); color: var(--sn-text-secondary); margin-bottom: 6px; display: block;">Playlist Name</label>
        <input type="text" id="pl-name-input" class="sn-modal-input" placeholder="e.g. Nightfall Ambient, Synthwave Drive..." autofocus>
      </div>
      <div class="sn-modal-footer">
        <button class="sn-btn sn-btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="sn-btn sn-btn-primary" id="modal-confirm-btn">Create Playlist</button>
      </div>
    `;

    document.getElementById('modal-confirm-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('pl-name-input')?.value;
      try {
        const initialTracks = data ? [data.id] : [];
        const pl = await playlistManager.createPlaylist(name, initialTracks);
        showNotification(`Created playlist "${pl.name}".`);
        closeModal();
      } catch (err) {
        showNotification(err.message, true);
      }
    });
  } else if (type === 'rename_playlist') {
    DOM.modalDialog.innerHTML = `
      <div class="sn-modal-header">
        <h2 class="sn-modal-title">Rename Playlist</h2>
        <button class="sn-modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="sn-modal-body">
        <label for="pl-rename-input" style="font-size: var(--sn-text-xs); color: var(--sn-text-secondary); margin-bottom: 6px; display: block;">New Name</label>
        <input type="text" id="pl-rename-input" class="sn-modal-input" value="${escapeHtml(data.name)}">
      </div>
      <div class="sn-modal-footer">
        <button class="sn-btn sn-btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="sn-btn sn-btn-primary" id="modal-confirm-btn">Save Changes</button>
      </div>
    `;

    document.getElementById('modal-confirm-btn')?.addEventListener('click', async () => {
      const newName = document.getElementById('pl-rename-input')?.value;
      try {
        await playlistManager.renamePlaylist(data.id, newName);
        showNotification('Playlist renamed.');
        closeModal();
      } catch (err) {
        showNotification(err.message, true);
      }
    });
  } else if (type === 'add_to_playlist') {
    const { playlists } = getState();
    const playlistList = Array.from(playlists.values());

    DOM.modalDialog.innerHTML = `
      <div class="sn-modal-header">
        <h2 class="sn-modal-title">Add to Playlist</h2>
        <button class="sn-modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="sn-modal-body">
        <p style="font-size: var(--sn-text-sm); color: var(--sn-text-secondary); margin-bottom: var(--sn-space-4);">
          Choose a playlist for <strong>${escapeHtml(data.title)}</strong>:
        </p>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;">
          ${playlistList.length === 0 ? `
            <p class="sn-text-xs sn-text-muted">No custom playlists exist yet.</p>
          ` : playlistList.map(pl => `
            <button class="sn-btn sn-btn-secondary" data-pl-target="${pl.id}" style="justify-content: flex-start; text-align: left; padding: 10px 14px;">
              <span>${escapeHtml(pl.name)}</span>
              <span class="sn-text-xs sn-text-muted" style="margin-left: auto;">${pl.itemIds.length} tracks</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="sn-modal-footer">
        <button class="sn-btn sn-btn-secondary" id="modal-new-pl-btn">+ Create New Playlist</button>
        <button class="sn-btn sn-btn-secondary" id="modal-cancel-btn">Close</button>
      </div>
    `;

    DOM.modalDialog.querySelectorAll('[data-pl-target]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const plId = btn.dataset.plTarget;
        const added = await playlistManager.addTrackToPlaylist(plId, data.id);
        if (added) {
          showNotification(`Added to "${playlists.get(plId)?.name}".`);
        } else {
          showNotification(`Track is already in this playlist.`);
        }
        closeModal();
      });
    });

    document.getElementById('modal-new-pl-btn')?.addEventListener('click', () => {
      openModal('create_playlist', data);
    });
  } else if (type === 'relink_file') {
    DOM.modalDialog.innerHTML = `
      <div class="sn-modal-header">
        <h2 class="sn-modal-title">Re-link Local Media File</h2>
        <button class="sn-modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="sn-modal-body">
        <p style="font-size: var(--sn-text-sm); line-height: 1.5; color: var(--sn-text-secondary); margin-bottom: var(--sn-space-3);">
          Browser security limits permanent file handles across page reloads. Re-select the local file to restore playback for <strong>${escapeHtml(data.title)}</strong>.
        </p>
        <div style="background: var(--sn-bg-surface-elevated); padding: 12px; border-radius: var(--sn-radius-md); font-size: var(--sn-text-xs); color: var(--sn-text-muted); margin-bottom: var(--sn-space-4);">
          <div><strong>Expected file:</strong> ${escapeHtml(data.name || data.filename || 'media file')}</div>
          <div style="margin-top: 4px;"><strong>Expected size:</strong> ${formatBytes(data.size)}</div>
        </div>
        <input type="file" id="relink-file-input" style="display: none;" accept="audio/*,video/*">
        <button class="sn-btn sn-btn-primary" id="relink-browse-btn" style="width: 100%;">
          Locate File on Computer
        </button>
      </div>
      <div class="sn-modal-footer">
        <button class="sn-btn sn-btn-secondary" id="modal-cancel-btn">Cancel</button>
      </div>
    `;

    const fileInput = document.getElementById('relink-file-input');
    document.getElementById('relink-browse-btn')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        relinkMediaItem(data, file);

        const { items } = getState();
        const updatedItems = new Map(items);
        updatedItems.set(data.id, data);
        setState({ items: updatedItems });

        await storage.saveLibraryItem(data);
        showNotification(`Re-linked "${data.title}" successfully.`);
        closeModal();
        loadAndPlayItem(data.id, true);
      }
    });
  }

  // Common Modal Controls
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

  DOM.modalContainer.style.display = 'flex';
  DOM.modalContainer.setAttribute('aria-hidden', 'false');
  updateBackdrop();
}

/**
 * Closes currently active modal.
 */
function closeModal() {
  setState({ activeModal: null, modalData: null });
  if (DOM.modalContainer) {
    DOM.modalContainer.style.display = 'none';
    DOM.modalContainer.setAttribute('aria-hidden', 'true');
  }
  updateBackdrop();
}

/**
 * Displays a non-intrusive toast notification.
 * @param {string} msg
 * @param {boolean} isError
 */
function showNotification(msg, isError = false) {
  let toast = document.querySelector('.sn-toast-alert');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'sn-toast-alert';
    toast.style.cssText = `
      position: fixed;
      bottom: calc(var(--sn-player-height) + 16px);
      right: 24px;
      background: var(--sn-bg-surface-elevated);
      color: var(--sn-text-primary);
      border: 1px solid var(--sn-border-medium);
      box-shadow: var(--sn-shadow-lg);
      padding: 10px 18px;
      border-radius: var(--sn-radius-md);
      font-size: var(--sn-text-xs);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 1000;
      opacity: 0;
      transform: translateY(8px);
      transition: all var(--sn-transition-normal);
      max-width: 420px;
    `;
    document.body.appendChild(toast);
  }

  const dotColor = isError ? 'var(--sn-rose-accent)' : 'var(--sn-accent-primary)';
  toast.innerHTML = `
    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></span>
    <span>${escapeHtml(msg)}</span>
  `;

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, isError ? 4500 : 2800);
}

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
