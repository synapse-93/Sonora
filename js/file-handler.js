/**
 * Sonora — File Ingestion & Object URL Registry (Phase 2)
 * Manages local file selection, drag-and-drop validation, and object URL lifecycle.
 * Adheres strictly to ARCHITECTURE.md Section 2.4 and ADR-04.
 */

import { generateId } from './utils.js';

// Central Registry tracking all allocated Object URLs: Map<mediaId, string>
const ObjectUrlRegistry = new Map();

// Supported audio and video file extensions
export const SUPPORTED_EXTENSIONS = new Set([
  // Audio
  '.mp3', '.wav', '.ogg', '.oga', '.flac', '.aac', '.m4a', '.weba',
  // Video
  '.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv'
]);

// Common supported MIME type prefixes
export const SUPPORTED_MIME_PREFIXES = ['audio/', 'video/'];

/**
 * Generates bespoke cinematic SVG cover art for imported local media.
 * @param {string} title
 * @param {string} mediaType
 * @returns {string} SVG Data URL
 */
function generateLocalPosterSvg(title, mediaType) {
  const isVideo = mediaType === 'video';
  const color1 = isVideo ? '#EC4899' : '#8B5CF6';
  const color2 = isVideo ? '#8B5CF6' : '#3B82F6';

  const iconSvg = isVideo
    ? `<polygon points="12 8 18 12 12 16 12 8" fill="#FFFFFF"/><rect x="4" y="4" width="16" height="16" rx="2" stroke="#FFFFFF" stroke-width="1.5" fill="none"/>`
    : `<path d="M9 18V5l12-2v13" stroke="#FFFFFF" stroke-width="1.5" fill="none"/><circle cx="6" cy="18" r="3" fill="#FFFFFF"/><circle cx="18" cy="16" r="3" fill="#FFFFFF"/>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 375" width="100%" height="100%">
      <defs>
        <linearGradient id="localBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0E1017"/>
          <stop offset="50%" stop-color="#181B26"/>
          <stop offset="100%" stop-color="#0A0B10"/>
        </linearGradient>
        <linearGradient id="localAccent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color1}"/>
          <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="375" fill="url(#localBg)"/>
      <circle cx="300" cy="150" r="85" fill="url(#localAccent)" opacity="0.25"/>
      <circle cx="300" cy="150" r="50" fill="url(#localAccent)" opacity="0.5"/>
      <g transform="translate(286, 136) scale(1.2)">
        ${iconSvg}
      </g>
      <rect x="0" y="270" width="600" height="105" fill="rgba(11, 12, 16, 0.85)"/>
      <text x="32" y="318" fill="#F9FAFB" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="-0.02em">${title.length > 36 ? title.substring(0, 34) + '...' : title}</text>
      <text x="32" y="348" fill="#9CA3AF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500">Local ${isVideo ? 'Video' : 'Audio'} Track</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Validates a candidate File object against supported audio and video formats.
 * @param {File} file
 * @returns {{ valid: boolean, type: 'audio' | 'video' | null, reason?: string }}
 */
export function validateMediaFile(file) {
  if (!file) {
    return { valid: false, type: null, reason: 'Empty file' };
  }

  const mime = file.type ? file.type.toLowerCase() : '';
  const name = file.name ? file.name.toLowerCase() : '';
  const ext = name.substring(name.lastIndexOf('.'));

  // 1. Check MIME type first
  if (mime.startsWith('audio/')) {
    return { valid: true, type: 'audio' };
  }
  if (mime.startsWith('video/')) {
    return { valid: true, type: 'video' };
  }

  // 2. Fallback to extension check if browser omitted or misreported MIME
  if (SUPPORTED_EXTENSIONS.has(ext)) {
    const isVideo = ['.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv'].includes(ext);
    return { valid: true, type: isVideo ? 'video' : 'audio' };
  }

  return {
    valid: false,
    type: null,
    reason: `Unsupported format "${ext || 'unknown'}". Supported formats include MP3, WAV, FLAC, OGG, AAC, MP4, WebM, MOV.`
  };
}

/**
 * Creates an immutable MediaItem descriptor from a validated local File.
 * Registers the generated Object URL in ObjectUrlRegistry.
 * @param {File} file
 * @returns {object} MediaItem descriptor
 */
export function createMediaItem(file) {
  const validation = validateMediaFile(file);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const id = generateId('loc');
  const url = URL.createObjectURL(file);

  // Register in memory tracking registry
  ObjectUrlRegistry.set(id, url);

  // Clean title from filename
  const rawName = file.name;
  const lastDot = rawName.lastIndexOf('.');
  const title = lastDot > 0 ? rawName.substring(0, lastDot) : rawName;
  const ext = lastDot > 0 ? rawName.substring(lastDot).toUpperCase() : '';

  return {
    id,
    name: file.name,
    title: title.replace(/[_]+/g, ' '),
    artist: 'Local Media',
    type: validation.type,
    format: file.type || ext || (validation.type === 'video' ? 'VIDEO' : 'AUDIO'),
    size: file.size,
    duration: 0, // Populated asynchronously on metadata load
    year: new Date(file.lastModified).getFullYear() || new Date().getFullYear(),
    genre: validation.type === 'video' ? 'Local Video' : 'Local Audio',
    thumbnail: generateLocalPosterSvg(title, validation.type),
    file,
    url,
    isLocal: true,
    addedAt: Date.now()
  };
}

/**
 * Processes an array or FileList of candidate files.
 * @param {FileList | Array<File>} fileList
 * @returns {{ accepted: Array<object>, rejected: Array<string> }}
 */
export function processFiles(fileList) {
  const accepted = [];
  const rejected = [];

  if (!fileList || fileList.length === 0) {
    return { accepted, rejected };
  }

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const validation = validateMediaFile(file);

    if (validation.valid) {
      try {
        const item = createMediaItem(file);
        accepted.push(item);
      } catch (err) {
        rejected.push(`${file.name}: ${err.message}`);
      }
    } else {
      rejected.push(`${file.name}: ${validation.reason}`);
    }
  }

  return { accepted, rejected };
}

/**
 * Revokes a tracked Object URL by media ID to free browser memory.
 * @param {string} id
 */
export function revokeMediaUrl(id) {
  if (ObjectUrlRegistry.has(id)) {
    const url = ObjectUrlRegistry.get(id);
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn(`Error revoking object URL for ID ${id}:`, err);
    }
    ObjectUrlRegistry.delete(id);
  }
}

/**
 * Revokes all tracked Object URLs (called on teardown / page unload).
 */
export function revokeAllUrls() {
  for (const [id, url] of ObjectUrlRegistry.entries()) {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      // Ignore
    }
  }
  ObjectUrlRegistry.clear();
}

// Hook into window beforeunload for deterministic memory leak prevention (ADR-04)
window.addEventListener('beforeunload', () => {
  revokeAllUrls();
});
