/**
 * Sonora — Unified Native Media Playback Engine (Phase 2)
 * Manages native HTML5 <audio> and <video> elements with single-source arbitration.
 * Adheres strictly to ARCHITECTURE.md Section 2.5 and Phase 2 requirements.
 */

import { getState, setPlaybackState } from './state.js';
import { clamp } from './utils.js';

class MediaEngine {
  constructor() {
    this.audioElement = null;
    this.videoElement = null;
    this.activeElement = null;
    this.currentMediaItem = null;
    this.isSeeking = false;
    this.onEndedCallback = null;
    this.onErrorCallback = null;
    this.playPromise = null;
  }

  /**
   * Initializes the engine with DOM audio and video elements and attaches native listeners.
   * @param {{ audioElement: HTMLAudioElement, videoElement: HTMLVideoElement }} config
   */
  init({ audioElement, videoElement }) {
    if (!audioElement || !videoElement) {
      throw new Error('MediaEngine requires both audioElement and videoElement.');
    }

    this.audioElement = audioElement;
    this.videoElement = videoElement;

    // Attach listeners once to prevent duplicate handler accumulation
    this._attachEventListeners(this.audioElement, 'audio');
    this._attachEventListeners(this.videoElement, 'video');

    // Apply initial persisted settings from state
    const { playback } = getState();
    this.setVolume(playback.volume);
    this.setMuted(playback.isMuted);
    this.setPlaybackRate(playback.playbackRate);

    console.log('MediaEngine initialized successfully.');
  }

  /**
   * Attaches normalized event listeners to a media element.
   * @param {HTMLMediaElement} el
   * @param {'audio' | 'video'} type
   * @private
   */
  _attachEventListeners(el, type) {
    el.addEventListener('loadedmetadata', () => {
      if (this.activeElement !== el) return;
      const duration = el.duration || 0;

      // Update duration in state
      setPlaybackState({
        duration,
        status: el.paused ? 'paused' : 'playing'
      });

      // Also update duration on current mediaItem if missing
      if (this.currentMediaItem && (!this.currentMediaItem.duration || this.currentMediaItem.duration === 0)) {
        this.currentMediaItem.duration = duration;
      }
    });

    el.addEventListener('timeupdate', () => {
      if (this.activeElement !== el || this.isSeeking) return;
      setPlaybackState({
        currentTime: el.currentTime || 0
      });
    });

    el.addEventListener('play', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({ status: 'playing', error: null });
    });

    el.addEventListener('playing', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({ status: 'playing', error: null });
    });

    el.addEventListener('pause', () => {
      if (this.activeElement !== el) return;
      // Do not transition to paused if media ended or errored
      if (!el.ended && !el.error) {
        setPlaybackState({ status: 'paused' });
      }
    });

    el.addEventListener('waiting', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({ status: 'loading' });
    });

    el.addEventListener('canplay', () => {
      if (this.activeElement !== el) return;
      if (el.paused) {
        setPlaybackState({ status: 'paused' });
      }
    });

    el.addEventListener('ended', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({ status: 'ended', currentTime: el.duration || 0 });

      if (typeof this.onEndedCallback === 'function') {
        this.onEndedCallback(this.currentMediaItem);
      }
    });

    el.addEventListener('error', () => {
      if (this.activeElement !== el) return;

      const mediaError = el.error;
      let errMsg = 'Playback decode error';

      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errMsg = 'Playback aborted by user.';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errMsg = 'Network or file read error occurred.';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errMsg = 'Media codec decode error. Unsupported audio/video compression format.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errMsg = 'Media format or codec is not supported by this browser.';
            break;
          default:
            errMsg = mediaError.message || 'Unknown media playback error.';
        }
      }

      console.warn(`[MediaEngine] Native element error on ${type}:`, errMsg);
      setPlaybackState({ status: 'error', error: errMsg });

      if (typeof this.onErrorCallback === 'function') {
        this.onErrorCallback(errMsg, this.currentMediaItem);
      }
    });

    el.addEventListener('volumechange', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({
        volume: el.volume,
        isMuted: el.muted
      });
    });

    el.addEventListener('ratechange', () => {
      if (this.activeElement !== el) return;
      setPlaybackState({
        playbackRate: el.playbackRate
      });
    });
  }

  /**
   * Loads a media item into the appropriate element and prepares playback.
   * Ensures previous active element is stopped and unloaded.
   * @param {object} mediaItem
   * @param {boolean} autoPlay Whether to immediately begin playback
   * @returns {Promise<void>}
   */
  async load(mediaItem, autoPlay = false) {
    if (!mediaItem || !mediaItem.url) {
      throw new Error('Invalid media item provided to load.');
    }

    // 1. Stop current active playback completely
    this._stopActiveElement();

    this.currentMediaItem = mediaItem;
    const isVideo = mediaItem.type === 'video';

    // 2. Select the designated element
    const nextElement = isVideo ? this.videoElement : this.audioElement;
    const dormantElement = isVideo ? this.audioElement : this.videoElement;

    // Ensure dormant element is hidden and unloaded
    dormantElement.pause();
    dormantElement.removeAttribute('src');
    dormantElement.load();
    if (dormantElement === this.videoElement) {
      this.videoElement.style.display = 'none';
    }

    this.activeElement = nextElement;

    // Configure video visibility if video
    if (isVideo) {
      this.videoElement.style.display = 'block';
    } else {
      this.videoElement.style.display = 'none';
    }

    // 3. Set source and settings
    const { playback } = getState();
    nextElement.src = mediaItem.url;
    nextElement.playbackRate = playback.playbackRate || 1.0;
    nextElement.preservesPitch = true;
    nextElement.volume = playback.volume !== undefined ? playback.volume : 0.85;
    nextElement.muted = Boolean(playback.isMuted);

    setPlaybackState({
      currentTrackId: mediaItem.id,
      currentTime: 0,
      duration: mediaItem.duration || 0,
      status: 'loading',
      error: null
    });

    nextElement.load();

    if (autoPlay) {
      return this.play();
    }
  }

  /**
   * Begins playback on the active media element.
   * Gracefully handles browser play promises and rejection reasons.
   * @returns {Promise<void>}
   */
  async play() {
    if (!this.activeElement || !this.currentMediaItem) {
      return Promise.reject(new Error('No media item loaded.'));
    }

    try {
      this.playPromise = this.activeElement.play();
      await this.playPromise;
      setPlaybackState({ status: 'playing', error: null });
    } catch (err) {
      // AbortError happens during rapid skipping and is benign
      if (err.name === 'AbortError') {
        return;
      }

      console.warn('[MediaEngine] Play request rejected:', err.name, err.message);

      let friendlyMessage = err.message;
      if (err.name === 'NotAllowedError') {
        friendlyMessage = 'Playback blocked by browser autoplay policy. Click play directly to start audio.';
      } else if (err.name === 'NotSupportedError') {
        friendlyMessage = 'The media codec or format could not be decoded by your browser.';
      }

      setPlaybackState({ status: 'paused', error: friendlyMessage });
      throw err;
    }
  }

  /**
   * Pauses active media playback.
   */
  pause() {
    if (this.activeElement && !this.activeElement.paused) {
      this.activeElement.pause();
      setPlaybackState({ status: 'paused' });
    }
  }

  /**
   * Toggles play and pause on the active media element.
   * @returns {Promise<void>}
   */
  async togglePlay() {
    if (!this.activeElement || !this.currentMediaItem) {
      return Promise.reject(new Error('No media item selected'));
    }

    if (this.activeElement.paused || this.activeElement.ended) {
      return this.play();
    } else {
      this.pause();
    }
  }

  /**
   * Seeks to a specific offset in seconds.
   * @param {number} seconds Target time in seconds
   */
  seek(seconds) {
    if (!this.activeElement) return;

    const maxDuration = this.activeElement.duration || this.currentMediaItem?.duration || 0;
    const clampedTime = clamp(seconds, 0, maxDuration > 0 ? maxDuration : 0);

    this.activeElement.currentTime = clampedTime;
    setPlaybackState({ currentTime: clampedTime });
  }

  /**
   * Adjusts volume level [0.0, 1.0].
   * @param {number} volume
   */
  setVolume(volume) {
    const clamped = clamp(volume, 0, 1);
    if (this.audioElement) this.audioElement.volume = clamped;
    if (this.videoElement) this.videoElement.volume = clamped;
    setPlaybackState({ volume: clamped });
  }

  /**
   * Toggles or sets audio mute status.
   * @param {boolean} isMuted
   */
  setMuted(isMuted) {
    const muted = Boolean(isMuted);
    if (this.audioElement) this.audioElement.muted = muted;
    if (this.videoElement) this.videoElement.muted = muted;
    setPlaybackState({ isMuted: muted });
  }

  /**
   * Sets playback rate [0.25, 2.0] with pitch preservation.
   * @param {number} rate
   */
  setPlaybackRate(rate) {
    const clamped = clamp(rate, 0.25, 2.0);
    if (this.audioElement) {
      this.audioElement.playbackRate = clamped;
      this.audioElement.preservesPitch = true;
    }
    if (this.videoElement) {
      this.videoElement.playbackRate = clamped;
      this.videoElement.preservesPitch = true;
    }
    setPlaybackState({ playbackRate: clamped });
  }

  /**
   * Registers callback invoked when track completes naturally.
   * @param {Function} callback
   */
  onTrackEnded(callback) {
    this.onEndedCallback = callback;
  }

  /**
   * Registers callback invoked when a playback error occurs.
   * @param {Function} callback
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Stops and unloads the current active element.
   * @private
   */
  _stopActiveElement() {
    if (this.activeElement) {
      try {
        this.activeElement.pause();
        this.activeElement.removeAttribute('src');
        this.activeElement.load();
      } catch (err) {
        // Ignore unload errors
      }
    }
  }

  /**
   * Cleans up all media elements and releases memory.
   */
  cleanup() {
    this._stopActiveElement();
    this.activeElement = null;
    this.currentMediaItem = null;
    setPlaybackState({
      status: 'idle',
      currentTrackId: null,
      currentTime: 0,
      duration: 0,
      error: null
    });
  }

  /**
   * Returns current active element for Web Audio graph connection.
   * @returns {HTMLMediaElement | null}
   */
  getActiveElement() {
    return this.activeElement;
  }
}

// Export singleton instance
export const mediaEngine = new MediaEngine();
