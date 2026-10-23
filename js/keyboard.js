/**
 * Sonora — Global Keyboard Shortcuts Registry (Phase 2)
 * Dispatches transport and volume shortcuts with text-input collision guards.
 * Adheres strictly to ARCHITECTURE.md Section 2.10.
 */

import { getState } from './state.js';

class KeyboardController {
  constructor() {
    this.mediaEngine = null;
    this.callbacks = {};
    this.boundHandler = null;
  }

  /**
   * Initializes the keyboard controller with media engine and queue navigation callbacks.
   * @param {object} mediaEngine
   * @param {{ onNext: Function, onPrev: Function }} callbacks
   */
  init(mediaEngine, callbacks = {}) {
    this.mediaEngine = mediaEngine;
    this.callbacks = callbacks;

    this.boundHandler = this._handleKeyDown.bind(this);
    window.addEventListener('keydown', this.boundHandler);

    console.log('Keyboard shortcut system initialized.');
  }

  /**
   * Evaluates keydown events and triggers corresponding player actions.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyDown(e) {
    // 1. Input Focus Guard: Ignore shortcuts when user is focused inside text fields
    const target = e.target;
    if (target) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
      if (isInput) {
        return;
      }
    }

    // Ignore modifier combinations like Ctrl+R or Cmd+S
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    const { playback } = getState();

    switch (e.code) {
      // Space / KeyK: Toggle Play/Pause
      case 'Space':
      case 'KeyK':
        e.preventDefault();
        this.mediaEngine.togglePlay().catch(() => {});
        break;

      // ArrowLeft / KeyJ: Seek Backward 5s / 10s
      case 'ArrowLeft':
        e.preventDefault();
        this.mediaEngine.seek(playback.currentTime - 5);
        break;
      case 'KeyJ':
        e.preventDefault();
        this.mediaEngine.seek(playback.currentTime - 10);
        break;

      // ArrowRight / KeyL: Seek Forward 5s / 10s
      case 'ArrowRight':
        e.preventDefault();
        this.mediaEngine.seek(playback.currentTime + 5);
        break;
      case 'KeyL':
        e.preventDefault();
        this.mediaEngine.seek(playback.currentTime + 10);
        break;

      // ArrowUp: Volume +5%
      case 'ArrowUp':
        e.preventDefault();
        this.mediaEngine.setVolume(playback.volume + 0.05);
        break;

      // ArrowDown: Volume -5%
      case 'ArrowDown':
        e.preventDefault();
        this.mediaEngine.setVolume(playback.volume - 0.05);
        break;

      // KeyM: Toggle Mute
      case 'KeyM':
        e.preventDefault();
        this.mediaEngine.setMuted(!playback.isMuted);
        break;

      // KeyN: Next Track
      case 'KeyN':
        e.preventDefault();
        if (typeof this.callbacks.onNext === 'function') {
          this.callbacks.onNext();
        }
        break;

      // KeyP: Previous Track
      case 'KeyP':
        e.preventDefault();
        if (typeof this.callbacks.onPrev === 'function') {
          this.callbacks.onPrev();
        }
        break;

      // 0-9 Number keys: Seek to 0%-90%
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9': {
        const percent = parseInt(e.code.replace('Digit', ''), 10) / 10;
        const duration = playback.duration || 0;
        if (duration > 0) {
          e.preventDefault();
          this.mediaEngine.seek(duration * percent);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Destroys listener on cleanup.
   */
  destroy() {
    if (this.boundHandler) {
      window.removeEventListener('keydown', this.boundHandler);
      this.boundHandler = null;
    }
  }
}

export const keyboardController = new KeyboardController();
