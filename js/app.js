/**
 * Sonora — Application Orchestrator (Phase 1)
 * Coordinates UI state, views, navigation, card selection, search, queue drawer, and responsive layout.
 * Playback engine is explicitly disabled in this UI foundation phase.
 */

import { getState, setState, subscribe } from './state.js';
import { SAMPLE_MEDIA_ITEMS } from './sample-data.js';
import { formatTime, formatBytes, debounce, escapeHtml } from './utils.js';

// Cached DOM Elements
const DOM = {
  // Navigation
  sidebar: document.getElementById('sidebar'),
  btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
  navButtons: document.querySelectorAll('.sn-nav-item[data-view]'),
  badgeLibrary: document.getElementById('nav-badge-library'),
  badgePlaylists: document.getElementById('nav-badge-playlists'),
  badgeFavourites: document.getElementById('nav-badge-favourites'),

  // Header & Search
  searchInput: document.getElementById('search-input'),
  btnSearchClear: document.getElementById('btn-search-clear'),

  // Hero Canvas
  heroCanvas: document.getElementById('hero-canvas'),
  heroBackdrop: document.getElementById('hero-backdrop'),
  heroArtImg: document.getElementById('hero-art-img'),
  heroTypeBadge: document.getElementById('hero-type-badge'),
  heroFormatBadge: document.getElementById('hero-format-badge'),
  heroDurationBadge: document.getElementById('hero-duration-badge'),
  heroSizeBadge: document.getElementById('hero-size-badge'),
  heroTitle: document.getElementById('hero-title'),
  heroArtist: document.getElementById('hero-artist'),
  heroDesc: document.getElementById('hero-desc'),
  btnHeroQueue: document.getElementById('btn-hero-queue'),
  btnHeroFav: document.getElementById('btn-hero-fav'),

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
  queueBody: document.getElementById('queue-body'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  queueHeaderCount: document.getElementById('queue-header-count'),
  playerQueueBadge: document.getElementById('player-queue-badge'),

  // Bottom Player Bar Preview
  playerThumbImg: document.getElementById('player-thumb-img'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  playerTimeCurrent: document.getElementById('player-time-current'),
  playerTimeDuration: document.getElementById('player-time-duration'),
  playerScrubber: document.getElementById('player-scrubber'),
  btnPlayerFav: document.getElementById('btn-player-fav'),

  // Backdrop
  backdrop: document.getElementById('backdrop')
};

/**
 * Initializes the application.
 */
function init() {
  // Populate items in state from sample fixtures
  const itemsMap = new Map();
  SAMPLE_MEDIA_ITEMS.forEach(item => itemsMap.set(item.id, item));

  // Initialize state with sample items and initial selection
  const initialSelectedId = SAMPLE_MEDIA_ITEMS[0]?.id || null;
  setState({
    items: itemsMap,
    selectedMediaId: initialSelectedId,
    activeQueue: ['trk_01', 'trk_02', 'trk_04']
  });

  // Setup UI Event Listeners
  bindEvents();

  // Setup Reactive Subscriptions
  setupSubscriptions();

  // Initial render
  updateHeroPreview(initialSelectedId);
  updatePlayerBarPreview(initialSelectedId);
  renderCatalog();
  renderQueue();
  updateBadges();

  console.log('Sonora Phase 1 UI Foundation initialized successfully.');
}

/**
 * Binds DOM event listeners.
 */
function bindEvents() {
  // Sidebar Navigation
  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = btn.dataset.view;
      if (view) {
        setState({ currentView: view, isSidebarOpen: false });
      }
    });
  });

  // Sidebar Mobile Toggle
  DOM.btnSidebarToggle?.addEventListener('click', () => {
    const { isSidebarOpen } = getState();
    setState({ isSidebarOpen: !isSidebarOpen, isQueueOpen: false });
  });

  // Backdrop Click (Closes drawers)
  DOM.backdrop?.addEventListener('click', () => {
    setState({ isSidebarOpen: false, isQueueOpen: false });
  });

  // Global Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const { isSidebarOpen, isQueueOpen } = getState();
      if (isSidebarOpen || isQueueOpen) {
        setState({ isSidebarOpen: false, isQueueOpen: false });
      }
    } else if (e.key === '/' && document.activeElement !== DOM.searchInput) {
      e.preventDefault();
      DOM.searchInput?.focus();
    }
  });

  // Search Input
  DOM.searchInput?.addEventListener('input', debounce((e) => {
    const query = e.target.value.trim();
    setState({ searchQuery: query });
    DOM.btnSearchClear.classList.toggle('visible', query.length > 0);
  }, 150));

  DOM.btnSearchClear?.addEventListener('click', () => {
    DOM.searchInput.value = '';
    DOM.btnSearchClear.classList.remove('visible');
    setState({ searchQuery: '' });
    DOM.searchInput.focus();
  });

  // Filter Pills
  DOM.filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter || 'all';
      setState({ filterType: filter });
    });
  });

  // Reset Filters button in Empty State
  DOM.btnEmptyReset?.addEventListener('click', () => {
    DOM.searchInput.value = '';
    DOM.btnSearchClear.classList.remove('visible');
    setState({ searchQuery: '', filterType: 'all', currentView: 'library' });
  });

  // Hero Actions
  DOM.btnHeroQueue?.addEventListener('click', () => {
    const { selectedMediaId, activeQueue } = getState();
    if (!selectedMediaId) return;

    if (!activeQueue.includes(selectedMediaId)) {
      const updatedQueue = [...activeQueue, selectedMediaId];
      setState({ activeQueue: updatedQueue });
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

  // Queue Drawer Toggle
  DOM.btnQueueToggle?.addEventListener('click', () => {
    const { isQueueOpen } = getState();
    setState({ isQueueOpen: !isQueueOpen, isSidebarOpen: false });
  });

  DOM.btnQueueClose?.addEventListener('click', () => {
    setState({ isQueueOpen: false });
  });
}

/**
 * Sets up state subscriptions for reactive rendering.
 */
function setupSubscriptions() {
  // View change
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

  // Selected media item change
  subscribe('selectedMediaId', (id) => {
    updateHeroPreview(id);
    updatePlayerBarPreview(id);
    highlightSelectedCard(id);
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
 * Updates modal/drawer backdrop state.
 */
function updateBackdrop() {
  const { isQueueOpen, isSidebarOpen } = getState();
  const shouldShow = isQueueOpen || isSidebarOpen;
  DOM.backdrop.classList.toggle('active', shouldShow);
  DOM.backdrop.setAttribute('aria-hidden', (!shouldShow).toString());
}

/**
 * Renders the media cards catalog based on current view, filter, and search query.
 */
function renderCatalog() {
  const { currentView, filterType, searchQuery, items, favourites, selectedMediaId } = getState();
  const allItems = Array.from(items.values());

  // Handle Playlists View (Phase 3 placeholder)
  if (currentView === 'playlists') {
    DOM.catalogTitle.textContent = 'Custom Playlists';
    DOM.catalogSubtitle.textContent = 'Curated media sequences';
    DOM.cardGrid.innerHTML = '';
    DOM.cardGrid.style.display = 'none';
    DOM.emptyState.style.display = 'flex';
    DOM.emptyTitle.textContent = 'Playlists Arrive in Phase 3';
    DOM.emptyDesc.textContent = 'Custom playlist creation, management, and persistent ordering will be unlocked in Phase 3.';
    DOM.btnEmptyReset.textContent = 'Return to Library';
    return;
  }

  // Filter items
  let filtered = allItems;

  if (currentView === 'favourites') {
    DOM.catalogTitle.textContent = 'Favourite Tracks';
    filtered = filtered.filter(item => favourites.has(item.id));
  } else if (currentView === 'home') {
    DOM.catalogTitle.textContent = 'Featured & Recent Media';
  } else {
    DOM.catalogTitle.textContent = 'Media Catalog';
  }

  // Format filter
  if (filterType !== 'all') {
    filtered = filtered.filter(item => item.type === filterType);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.artist.toLowerCase().includes(q) ||
      item.genre.toLowerCase().includes(q) ||
      item.format.toLowerCase().includes(q)
    );
  }

  DOM.catalogSubtitle.textContent = `Showing ${filtered.length} of ${allItems.length} items`;

  // Render cards or empty state
  if (filtered.length === 0) {
    DOM.cardGrid.innerHTML = '';
    DOM.cardGrid.style.display = 'none';
    DOM.emptyState.style.display = 'flex';

    if (currentView === 'favourites') {
      DOM.emptyTitle.textContent = 'No Favourites Yet';
      DOM.emptyDesc.textContent = 'Click the heart icon on any media card to save tracks to your favourites.';
      DOM.btnEmptyReset.textContent = 'Browse All Media';
    } else {
      DOM.emptyTitle.textContent = 'No Media Found';
      DOM.emptyDesc.textContent = `No media matches "${escapeHtml(searchQuery)}". Try adjusting your search or filters.`;
      DOM.btnEmptyReset.textContent = 'Reset Filters';
    }
  } else {
    DOM.emptyState.style.display = 'none';
    DOM.cardGrid.style.display = 'grid';

    DOM.cardGrid.innerHTML = filtered.map(item => {
      const isSelected = item.id === selectedMediaId;
      const isFav = favourites.has(item.id);
      const isVideo = item.type === 'video';

      return `
        <article
          class="sn-media-card ${isSelected ? 'selected' : ''}"
          data-id="${item.id}"
          tabindex="0"
          role="button"
          aria-label="Select track: ${escapeHtml(item.title)} by ${escapeHtml(item.artist)}"
        >
          <div class="sn-card-thumbnail-wrap">
            <img src="${item.thumbnail}" alt="${escapeHtml(item.title)} poster" class="sn-card-thumbnail" loading="lazy">
            <div class="sn-card-play-overlay" aria-hidden="true">
              <div class="sn-card-play-btn" data-tooltip="Playback in Phase 2">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
            </div>
            <span class="sn-badge ${isVideo ? 'sn-badge-video' : 'sn-badge-audio'} sn-card-type-badge">
              ${item.type.toUpperCase()}
            </span>
            <span class="sn-card-duration-badge">${formatTime(item.duration)}</span>
          </div>

          <div class="sn-card-content">
            <h3 class="sn-card-title">${escapeHtml(item.title)}</h3>
            <p class="sn-card-subtitle">${escapeHtml(item.artist)}</p>

            <div class="sn-card-footer">
              <span>${escapeHtml(item.genre)}</span>
              <button
                class="sn-card-fav-btn ${isFav ? 'active' : ''}"
                data-fav-id="${item.id}"
                aria-label="${isFav ? 'Remove from' : 'Add to'} favourites"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach card click handlers
    DOM.cardGrid.querySelectorAll('.sn-media-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // If clicking the favourite button inside the card, do not trigger card select
        if (e.target.closest('.sn-card-fav-btn')) return;

        const id = card.dataset.id;
        if (id) {
          setState({ selectedMediaId: id });
        }
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = card.dataset.id;
          if (id) setState({ selectedMediaId: id });
        }
      });
    });

    // Attach favourite toggle handlers
    DOM.cardGrid.querySelectorAll('.sn-card-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.favId;
        if (id) toggleFavourite(id);
      });
    });
  }
}

/**
 * Highlights the active selected card in the catalog grid.
 */
function highlightSelectedCard(id) {
  DOM.cardGrid.querySelectorAll('.sn-media-card').forEach(card => {
    const isSelected = card.dataset.id === id;
    card.classList.toggle('selected', isSelected);
  });
}

/**
 * Updates favourite icon fill/stroke across existing cards without full re-render.
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
 * Updates the hero cinematic canvas preview for the selected media item.
 */
function updateHeroPreview(id) {
  if (!id) return;
  const { items, favourites } = getState();
  const item = items.get(id);
  if (!item) return;

  // Update hero artwork & backdrop
  DOM.heroArtImg.src = item.thumbnail;
  DOM.heroArtImg.alt = `${item.title} artwork`;
  DOM.heroBackdrop.style.backgroundImage = `url("${item.thumbnail}")`;

  // Update badges
  const isVideo = item.type === 'video';
  DOM.heroTypeBadge.textContent = item.type.toUpperCase();
  DOM.heroTypeBadge.className = `sn-badge ${isVideo ? 'sn-badge-video' : 'sn-badge-audio'}`;
  DOM.heroFormatBadge.textContent = item.format;
  DOM.heroDurationBadge.textContent = formatTime(item.duration);
  DOM.heroSizeBadge.textContent = formatBytes(item.size);

  // Update text
  DOM.heroTitle.textContent = item.title;
  DOM.heroArtist.innerHTML = `
    <span>${escapeHtml(item.artist)}</span>
    <span class="sn-text-muted">•</span>
    <span class="sn-text-muted">${escapeHtml(item.genre)} (${item.year})</span>
  `;
  DOM.heroDesc.textContent = item.description || '';

  // Update favourite button in hero
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
 * Updates the bottom player bar with selected track information.
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
  DOM.playerTimeDuration.textContent = formatTime(item.duration);
  DOM.playerScrubber.max = item.duration;
  DOM.playerScrubber.setAttribute('aria-valuemax', item.duration.toString());
}

/**
 * Toggles a track's favourite state.
 */
function toggleFavourite(id) {
  const { favourites } = getState();
  const newFavourites = new Set(favourites);

  if (newFavourites.has(id)) {
    newFavourites.delete(id);
  } else {
    newFavourites.add(id);
  }

  setState({ favourites: newFavourites });
}

/**
 * Renders the queue panel drawer.
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

  DOM.queueBody.innerHTML = activeQueue.map(id => {
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
          <span class="sn-queue-item-meta">${escapeHtml(item.artist)} • ${formatTime(item.duration)}</span>
        </div>
        <button
          class="sn-queue-remove-btn"
          data-remove-id="${item.id}"
          aria-label="Remove ${escapeHtml(item.title)} from queue"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Queue item click to preview
  DOM.queueBody.querySelectorAll('.sn-queue-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sn-queue-remove-btn')) return;
      const id = el.dataset.queueId;
      if (id) setState({ selectedMediaId: id });
    });
  });

  // Remove from queue
  DOM.queueBody.querySelectorAll('.sn-queue-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.removeId;
      if (id) {
        const updatedQueue = activeQueue.filter(trackId => trackId !== id);
        setState({ activeQueue: updatedQueue });
      }
    });
  });
}

/**
 * Updates badge counters in sidebar navigation.
 */
function updateBadges() {
  const { items, favourites } = getState();
  if (DOM.badgeLibrary) DOM.badgeLibrary.textContent = items.size.toString();
  if (DOM.badgeFavourites) DOM.badgeFavourites.textContent = favourites.size.toString();
}

/**
 * Displays a non-intrusive notification indicator.
 */
function showNotification(msg) {
  // Check if existing toast exists
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
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--sn-accent-primary);"></span>
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
  }, 2200);
}

// Bootstrap on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
