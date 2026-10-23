/**
 * Sonora — Media Controls & Scrubber UI (Phase 2)
 * Binds transport controls, seek scrubber, volume, and playback speed to the media engine.
 * Adheres strictly to ARCHITECTURE.md Section 2.6.
 */

import { getState, subscribe } from './state.js';
import { formatTime } from './utils.js';

// SVG Icons for transport states
const ICONS = {
  play: `<polygon points="5 3 19 12 5 21 5 3"></polygon>`,
  pause: `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`,
  volumeHigh: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`,
  volumeMedium: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`,
  volumeLow: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>`,
  volumeMuted: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`
};

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

class PlayerControls {
  constructor() {
    this.mediaEngine = null;
    this.elements = {};
    this.isScrubbing = false;
    this.onNextTrack = null;
    this.onPrevTrack = null;
    this.onPlayRequested = null;
  }

  /**
   * Initializes player controls and binds UI listeners.
   * @param {object} elements
   * @param {object} mediaEngine
   * @param {{ onNext: Function, onPrev: Function, onPlayRequest: Function }} callbacks
   */
  init(elements, mediaEngine, callbacks = {}) {
    this.elements = elements;
    this.mediaEngine = mediaEngine;
    this.onNextTrack = callbacks.onNext;
    this.onPrevTrack = callbacks.onPrev;
    this.onPlayRequested = callbacks.onPlayRequest;

    this._bindEvents();
    this._setupSubscriptions();
    this.updateControlsState();
  }

  _bindEvents() {
    const {
      btnPlay,
      btnHeroPlay,
      btnPrev,
      btnNext,
      btnReplay,
      btnSkip,
      scrubber,
      volumeSlider,
      btnMute,
      speedBadge
    } = this.elements;

    // Play / Pause Button in bottom bar
    btnPlay?.addEventListener('click', () => {
      this._handlePlayToggle();
    });

    // Play button in Hero Media Canvas
    btnHeroPlay?.addEventListener('click', () => {
      this._handlePlayToggle();
    });

    // Previous Track Button
    btnPrev?.addEventListener('click', () => {
      const { playback } = getState();
      // If played more than 3 seconds, restart track
      if (playback.currentTime > 3) {
        this.mediaEngine.seek(0);
      } else if (typeof this.onPrevTrack === 'function') {
        this.onPrevTrack();
      }
    });

    // Next Track Button
    btnNext?.addEventListener('click', () => {
      if (typeof this.onNextTrack === 'function') {
        this.onNextTrack();
      }
    });

    // Replay 10 seconds
    btnReplay?.addEventListener('click', () => {
      const { playback } = getState();
      this.mediaEngine.seek(playback.currentTime - 10);
    });

    // Skip 10 seconds
    btnSkip?.addEventListener('click', () => {
      const { playback } = getState();
      this.mediaEngine.seek(playback.currentTime + 10);
    });

    // Timeline Scrubber Interactions
    if (scrubber) {
      // User starts dragging
      scrubber.addEventListener('mousedown', () => {
        this.isScrubbing = true;
      });
      scrubber.addEventListener('touchstart', () => {
        this.isScrubbing = true;
      }, { passive: true });

      // Live dragging feedback
      scrubber.addEventListener('input', (e) => {
        this.isScrubbing = true;
        const targetSeconds = parseFloat(e.target.value);
        if (this.elements.timeCurrent) {
          this.elements.timeCurrent.textContent = formatTime(targetSeconds);
        }
      });

      // User releases slider — commit seek
      scrubber.addEventListener('change', (e) => {
        this.isScrubbing = false;
        const targetSeconds = parseFloat(e.target.value);
        this.mediaEngine.seek(targetSeconds);
      });

      window.addEventListener('mouseup', () => {
        if (this.isScrubbing) this.isScrubbing = false;
      });
      window.addEventListener('touchend', () => {
        if (this.isScrubbing) this.isScrubbing = false;
      });
    }

    // Volume Slider
    volumeSlider?.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.mediaEngine.setVolume(vol);
      if (getState().playback.isMuted && vol > 0) {
        this.mediaEngine.setMuted(false);
      }
    });

    // Mute Toggle Button
    btnMute?.addEventListener('click', () => {
      const { playback } = getState();
      this.mediaEngine.setMuted(!playback.isMuted);
    });

    // Playback Speed Selector
    speedBadge?.addEventListener('click', () => {
      const { playback } = getState();
      const currentRate = playback.playbackRate || 1.0;
      const currentIndex = PLAYBACK_SPEEDS.indexOf(currentRate);
      const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
      const nextRate = PLAYBACK_SPEEDS[nextIndex];
      this.mediaEngine.setPlaybackRate(nextRate);
    });
  }

  _handlePlayToggle() {
    const { playback } = getState();

    // If an error occurred or no media loaded, delegate to coordinator
    if (playback.status === 'error' || !playback.currentTrackId) {
      if (typeof this.onPlayRequested === 'function') {
        this.onPlayRequested();
      }
      return;
    }

    this.mediaEngine.togglePlay().catch((err) => {
      console.warn('[PlayerControls] togglePlay error:', err);
    });
  }

  _setupSubscriptions() {
    subscribe('playback', (playback) => {
      this.renderPlaybackState(playback);
    });

    subscribe('selectedMediaId', () => {
      this.updateControlsState();
    });
  }

  /**
   * Updates disabled/enabled state of all controls based on media availability.
   */
  updateControlsState() {
    const { playback, selectedMediaId } = getState();
    const hasMedia = Boolean(selectedMediaId);

    const {
      btnPlay,
      btnHeroPlay,
      btnPrev,
      btnNext,
      btnReplay,
      btnSkip,
      scrubber,
      volumeSlider,
      btnMute,
      speedBadge
    } = this.elements;

    // Enable buttons when media is ready
    const buttons = [btnPlay, btnHeroPlay, btnPrev, btnNext, btnReplay, btnSkip, scrubber, volumeSlider, btnMute, speedBadge];
    buttons.forEach((el) => {
      if (!el) return;
      if (hasMedia) {
        el.removeAttribute('disabled');
        el.removeAttribute('aria-disabled');
        el.style.cursor = 'pointer';
      } else {
        el.setAttribute('disabled', 'true');
        el.setAttribute('aria-disabled', 'true');
        el.style.cursor = 'not-allowed';
      }
    });

    if (btnHeroPlay) {
      btnHeroPlay.removeAttribute('data-tooltip');
    }
  }

  /**
   * Synchronizes UI controls with native media state changes.
   * @param {object} playback
   */
  renderPlaybackState(playback) {
    const {
      btnPlay,
      btnHeroPlay,
      playIcon,
      scrubber,
      timeCurrent,
      timeDuration,
      volumeSlider,
      btnMute,
      speedBadge
    } = this.elements;

    const isPlaying = playback.status === 'playing';

    // 1. Play/Pause Icons & Labels
    const iconContent = isPlaying ? ICONS.pause : ICONS.play;
    const playLabel = isPlaying ? 'Pause Media' : 'Play Media';

    if (playIcon) playIcon.innerHTML = iconContent;
    if (btnPlay) {
      btnPlay.setAttribute('aria-label', playLabel);
      btnPlay.classList.toggle('active', isPlaying);
    }

    if (btnHeroPlay) {
      const heroSvg = btnHeroPlay.querySelector('svg');
      const heroLabel = btnHeroPlay.querySelector('span');
      if (heroSvg) heroSvg.innerHTML = iconContent;
      if (heroLabel) heroLabel.textContent = isPlaying ? 'Pause' : 'Play';
      btnHeroPlay.setAttribute('aria-label', playLabel);
    }

    // 2. Timeline Scrubber Progress
    const duration = playback.duration || 0;
    const currentTime = playback.currentTime || 0;

    if (scrubber && !this.isScrubbing) {
      scrubber.max = duration > 0 ? duration : 100;
      scrubber.value = currentTime;
      scrubber.setAttribute('aria-valuenow', Math.floor(currentTime).toString());
      scrubber.setAttribute('aria-valuemax', Math.floor(duration).toString());
    }

    if (timeCurrent && !this.isScrubbing) {
      timeCurrent.textContent = formatTime(currentTime);
    }

    if (timeDuration && duration > 0) {
      timeDuration.textContent = formatTime(duration);
    }

    // 3. Volume and Mute Icon
    if (volumeSlider) {
      volumeSlider.value = playback.isMuted ? 0 : playback.volume;
      volumeSlider.setAttribute('aria-valuenow', (playback.isMuted ? 0 : playback.volume).toString());
    }

    if (btnMute) {
      const muteSvg = btnMute.querySelector('svg');
      let glyph = ICONS.volumeHigh;

      if (playback.isMuted || playback.volume === 0) {
        glyph = ICONS.volumeMuted;
      } else if (playback.volume <= 0.35) {
        glyph = ICONS.volumeLow;
      } else if (playback.volume <= 0.7) {
        glyph = ICONS.volumeMedium;
      }

      if (muteSvg) muteSvg.innerHTML = glyph;
      btnMute.setAttribute('aria-label', playback.isMuted ? 'Unmute Audio' : 'Mute Audio');
    }

    // 4. Playback Speed Badge
    if (speedBadge) {
      const rate = playback.playbackRate || 1.0;
      speedBadge.textContent = `${rate}x`;
      speedBadge.setAttribute('data-tooltip', `Playback Speed: ${rate}x`);
    }
  }
}

export const playerControls = new PlayerControls();
