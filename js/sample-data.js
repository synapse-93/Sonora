/**
 * Sonora — Sample Media Fixtures (Phase 1)
 * Presentation fixtures for the visual library catalog.
 * No playable media URLs are invented; thumbnails are high-quality cinematic SVG posters.
 */

// Helper to generate bespoke cinematic SVG cover art
function createCoverSvg(title, artist, primaryColor, secondaryColor, patternType = 'waves') {
  let patternContent = '';

  if (patternType === 'waves') {
    patternContent = `
      <path d="M0,140 Q75,100 150,140 T300,140 T450,140 T600,140 L600,300 L0,300 Z" fill="url(#grad2)" opacity="0.4"/>
      <path d="M0,180 Q80,120 160,180 T320,180 T480,180 T600,180 L600,300 L0,300 Z" fill="url(#grad2)" opacity="0.6"/>
      <path d="M0,220 Q90,160 180,220 T360,220 T540,220 T600,220 L600,300 L0,300 Z" fill="url(#grad1)" opacity="0.7"/>
    `;
  } else if (patternType === 'cyber') {
    patternContent = `
      <line x1="0" y1="200" x2="600" y2="200" stroke="${primaryColor}" stroke-width="2" opacity="0.4"/>
      <line x1="0" y1="230" x2="600" y2="230" stroke="${primaryColor}" stroke-width="2" opacity="0.5"/>
      <line x1="0" y1="260" x2="600" y2="260" stroke="${primaryColor}" stroke-width="3" opacity="0.7"/>
      <line x1="100" y1="180" x2="0" y2="300" stroke="${secondaryColor}" stroke-width="1.5" opacity="0.5"/>
      <line x1="200" y1="180" x2="100" y2="300" stroke="${secondaryColor}" stroke-width="1.5" opacity="0.5"/>
      <line x1="300" y1="180" x2="300" y2="300" stroke="${secondaryColor}" stroke-width="1.5" opacity="0.6"/>
      <line x1="400" y1="180" x2="500" y2="300" stroke="${secondaryColor}" stroke-width="1.5" opacity="0.5"/>
      <line x1="500" y1="180" x2="600" y2="300" stroke="${secondaryColor}" stroke-width="1.5" opacity="0.5"/>
      <circle cx="300" cy="140" r="70" fill="url(#grad1)" opacity="0.9"/>
    `;
  } else if (patternType === 'rings') {
    patternContent = `
      <circle cx="300" cy="150" r="140" stroke="url(#grad1)" stroke-width="1.5" fill="none" opacity="0.25"/>
      <circle cx="300" cy="150" r="105" stroke="url(#grad1)" stroke-width="2" fill="none" opacity="0.45"/>
      <circle cx="300" cy="150" r="70" stroke="url(#grad2)" stroke-width="2.5" fill="none" opacity="0.7"/>
      <circle cx="300" cy="150" r="35" fill="url(#grad1)" opacity="0.85"/>
    `;
  } else if (patternType === 'noir') {
    patternContent = `
      <polygon points="0,0 240,0 160,300 0,300" fill="url(#grad1)" opacity="0.3"/>
      <polygon points="180,0 420,0 340,300 100,300" fill="url(#grad2)" opacity="0.25"/>
      <polygon points="360,0 600,0 520,300 280,300" fill="url(#grad1)" opacity="0.4"/>
      <line x1="0" y1="0" x2="600" y2="300" stroke="${primaryColor}" stroke-width="1.5" opacity="0.4"/>
    `;
  } else {
    patternContent = `
      <rect x="60" y="80" width="80" height="140" rx="6" fill="url(#grad1)" opacity="0.5"/>
      <rect x="170" y="50" width="80" height="170" rx="6" fill="url(#grad2)" opacity="0.7"/>
      <rect x="280" y="90" width="80" height="130" rx="6" fill="url(#grad1)" opacity="0.6"/>
      <rect x="390" y="60" width="80" height="160" rx="6" fill="url(#grad2)" opacity="0.8"/>
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 375" width="100%" height="100%">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0E1017"/>
          <stop offset="50%" stop-color="#141724"/>
          <stop offset="100%" stop-color="#090A0E"/>
        </linearGradient>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}"/>
          <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
        <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${secondaryColor}"/>
          <stop offset="100%" stop-color="${primaryColor}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="375" fill="url(#bg)"/>
      ${patternContent}
      <rect x="0" y="270" width="600" height="105" fill="rgba(11, 12, 16, 0.75)"/>
      <text x="32" y="318" fill="#F9FAFB" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" letter-spacing="-0.02em">${title}</text>
      <text x="32" y="348" fill="#9CA3AF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500">${artist}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_MEDIA_ITEMS = [
  {
    id: 'trk_01',
    title: 'Solaris: Starlight Drift',
    artist: 'Hans Richter',
    type: 'audio',
    format: 'FLAC 96kHz / 24-bit',
    duration: 252, // 04:12
    size: 44820100, // ~42.7 MB
    genre: 'Cinematic Ambient',
    year: 2024,
    thumbnail: createCoverSvg('Solaris: Starlight Drift', 'Hans Richter', '#8B5CF6', '#3B82F6', 'waves'),
    description: 'An atmospheric, sweeping analog synthesizer score blending cosmic drones with gentle cello harmonies.'
  },
  {
    id: 'trk_02',
    title: 'Neon Cyberpunk 2088: Rain On Glass',
    artist: 'Kaveh Vance',
    type: 'video',
    format: '4K UHD • MP4 (H.264)',
    duration: 165, // 02:45
    size: 134600200, // ~128.4 MB
    genre: 'Darksynth / Sci-Fi',
    year: 2024,
    thumbnail: createCoverSvg('Neon Cyberpunk 2088', 'Kaveh Vance', '#EC4899', '#8B5CF6', 'cyber'),
    description: 'Cinematic night-time metropolis drone sequence featuring heavy rain, neon holograms, and subterranean sub-bass.'
  },
  {
    id: 'trk_03',
    title: 'Dune Odyssey: Whispers in Sand',
    artist: 'Elena Rostova & Ensemble',
    type: 'audio',
    format: 'WAV Studio Master',
    duration: 330, // 05:30
    size: 61000500, // ~58.2 MB
    genre: 'Orchestral World',
    year: 2023,
    thumbnail: createCoverSvg('Dune Odyssey', 'Elena Rostova', '#F59E0B', '#DC2626', 'rings'),
    description: 'Haunting desert wind instruments and thundering percussion recorded live with microtonal vocals.'
  },
  {
    id: 'trk_04',
    title: 'Chrono Echoes: Part IV (Nocturne)',
    artist: 'Julian Thorne',
    type: 'audio',
    format: 'FLAC 48kHz / 24-bit',
    duration: 232, // 03:52
    size: 40480000, // ~38.6 MB
    genre: 'Modern Classical',
    year: 2024,
    thumbnail: createCoverSvg('Chrono Echoes', 'Julian Thorne', '#06B6D4', '#8B5CF6', 'waves'),
    description: 'Intimate felt piano with layered granular reverb and emotive solo violin counter-melodies.'
  },
  {
    id: 'trk_05',
    title: 'Quantum Horizon: Event Collapse',
    artist: 'Mira Stellan',
    type: 'audio',
    format: 'MP3 320 kbps',
    duration: 195, // 03:15
    size: 8180000, // ~7.8 MB
    genre: 'Deep Space Drone',
    year: 2023,
    thumbnail: createCoverSvg('Quantum Horizon', 'Mira Stellan', '#6366F1', '#10B981', 'rings'),
    description: 'Sub-bass frequencies and granular modular synthesis exploring psychological tension and spatial isolation.'
  },
  {
    id: 'trk_06',
    title: 'The Dark Descent: Alleyway Chase',
    artist: 'Marcus Kane',
    type: 'video',
    format: '1080p FHD • MP4',
    duration: 374, // 06:14
    size: 220700000, // ~210.5 MB
    genre: 'Suspense Noir',
    year: 2024,
    thumbnail: createCoverSvg('The Dark Descent', 'Marcus Kane', '#64748B', '#F43F5E', 'noir'),
    description: 'High-contrast black-and-white cinematic action cue featuring relentless ostinatos and brass crescendos.'
  },
  {
    id: 'trk_07',
    title: 'Vespera: Midnight Flight Over Kyoto',
    artist: 'Sophie Lin',
    type: 'audio',
    format: 'FLAC 96kHz / 24-bit',
    duration: 220, // 03:40
    size: 37850000, // ~36.1 MB
    genre: 'Ambient Lo-Fi',
    year: 2024,
    thumbnail: createCoverSvg('Vespera', 'Sophie Lin', '#10B981', '#06B6D4', 'waves'),
    description: 'Warm tape saturation, sampled rain texture, mellow Rhodes keys, and dreamy guitar swells.'
  },
  {
    id: 'trk_08',
    title: 'Cosmic Genesis: Beyond The Nebula',
    artist: 'Apex Soundworks',
    type: 'video',
    format: '4K UHD • WebM',
    duration: 118, // 01:58
    size: 98780000, // ~94.2 MB
    genre: 'Epic Cinema Trailer',
    year: 2024,
    thumbnail: createCoverSvg('Cosmic Genesis', 'Apex Soundworks', '#8B5CF6', '#F59E0B', 'cyber'),
    description: 'Dynamic teaser trailer demonstration featuring full brass stabs, synthetic risers, and astronomical CGI footage.'
  }
];
