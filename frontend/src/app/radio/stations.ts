export interface RadioStation {
  id: string;
  label: string;
  shortLabel: string;
  url: string;
  homepage: string;
}

/** Curated music-only chip / demoscene streams. No talk-radio sources. */
export const RADIO_STATIONS: readonly RadioStation[] = [
  {
    id: 'rainwave',
    label: 'Rainwave Chiptunes',
    shortLabel: 'Rainwave',
    url: 'https://relay.rainwave.cc/chiptune.mp3',
    homepage: 'https://rainwave.cc/chiptune/',
  },
  {
    id: 'cvgm',
    label: 'CVGM',
    shortLabel: 'CVGM',
    url: 'http://stream.cvgm.net:8000/cvgm128.ogg',
    homepage: 'https://www.cvgm.net/',
  },
  {
    id: 'nectarine',
    label: 'Nectarine',
    shortLabel: 'Nectarine',
    url: 'https://scenestream.io/necta64.mp3',
    homepage: 'https://scenestream.net/',
  },
];
