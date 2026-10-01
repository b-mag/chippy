export interface RadioStation {
  id: string;
  label: string;
  shortLabel: string;
  url: string;
  homepage: string;
  /**
   * When true, the stream is expected to send ACAO so we can set
   * `crossOrigin` and route through Web Audio for live viz.
   * Rainwave plays without CORS (element-native audio + synthetic viz).
   */
  cors: boolean;
  /** Optional metadata poller. */
  nowPlaying?: 'rainwave';
}

/** Curated music-only chip / demoscene streams. No talk-radio sources. */
export const RADIO_STATIONS: readonly RadioStation[] = [
  {
    id: 'rainwave',
    label: 'Rainwave Chiptunes',
    shortLabel: 'Rainwave',
    url: 'https://relay.rainwave.cc/chiptune.mp3',
    homepage: 'https://rainwave.cc/chiptune/',
    cors: false,
    nowPlaying: 'rainwave',
  },
  {
    id: 'cvgm',
    label: 'CVGM',
    shortLabel: 'CVGM',
    // Upstream is HTTP-only Icecast; works on localhost HTTP. HTTPS pages
    // block mixed content — player reports that clearly on failure.
    url: 'http://stream.cvgm.net:8000/cvgm128.ogg',
    homepage: 'https://www.cvgm.net/',
    cors: true,
  },
  {
    id: 'nectarine',
    label: 'Nectarine',
    shortLabel: 'Nectarine',
    // Element-native playback: this Icecast mount uses Connection: Close and
    // drops often under MediaElementSource; synthetic viz is the tradeoff.
    url: 'https://scenestream.io/necta64.mp3',
    homepage: 'https://scenestream.net/',
    cors: false,
  },
];
