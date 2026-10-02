export { parseProject, serializeProject, downloadName } from './lib/project-file';
export {
  instrumentDownloadName,
  parseInstrumentFile,
  serializeInstrumentFile,
  type InstrumentFileDocument,
} from './lib/instrument-file';
export { encodeYm6, parseYm, unwrapYmPayload, type ParsedYm } from './lib/ym6';
export { encodeVgm } from './lib/vgm';
export { a4Hz, a4Period, encodeWav, renderPcm } from './lib/pcm';
export { AkyUnsupportedError, encodeAky } from './lib/aky';
export {
  decodeLsdjSav,
  encodeLsdjSav,
  lsdjImportMapAligned,
  lsdjSavCompatibilityStatus,
  projectFromLsdjDecode,
  LSDJ_FORMAT_VERSION_MAX,
  LSDJ_FORMAT_VERSION_MIN,
  LSDJ_GREENFIELD_FORMAT_VERSION,
  LSDJ_SAV_SIZE,
  type LsdjDecodeResult,
  type LsdjEncodeOptions,
  type LsdjImportMap,
  type LsdjPhraseRef,
} from './lib/lsdj-sav';

import { renderSong } from '@chippy/engines';
import { chipDefinition, type Song } from '@chippy/domain';
import { encodeAky } from './lib/aky';
import { encodeLsdjSav, type LsdjEncodeOptions } from './lib/lsdj-sav';
import { renderPcm, encodeWav } from './lib/pcm';
import { encodeVgm } from './lib/vgm';
import { encodeYm6 } from './lib/ym6';

export interface ExportBundle {
  filename: string;
  bytes: Uint8Array;
  mime: string;
}

function safe(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'chippy';
}

export function exportWav(song: Song): ExportBundle {
  const rendered = renderSong(song);
  return {
    filename: `${safe(song.name)}.wav`,
    bytes: encodeWav(renderPcm(rendered)),
    mime: 'audio/wav',
  };
}

export function exportYm(song: Song): ExportBundle {
  const rendered = renderSong(song);
  if (rendered.chip !== 'vectrex' && rendered.chip !== 'atarist') {
    throw new Error('YM6 export is for Vectrex and Atari ST.');
  }
  const definition = chipDefinition(rendered.chip);
  return {
    filename: `${safe(song.name)}.ym`,
    bytes: encodeYm6(rendered.frames, song.name, definition.clockHz, definition.frameRate),
    mime: 'application/octet-stream',
  };
}

export function exportVgm(song: Song): ExportBundle {
  const rendered = renderSong(song);
  if (rendered.chip !== 'gameboy') {
    throw new Error('VGM export is for the Game Boy.');
  }
  return {
    filename: `${safe(song.name)}.vgm`,
    bytes: encodeVgm(rendered.frames, song.name),
    mime: 'application/octet-stream',
  };
}

export function exportLsdjSav(song: Song, options?: LsdjEncodeOptions): ExportBundle {
  return {
    filename: `${safe(song.name)}.sav`,
    bytes: encodeLsdjSav(song, options),
    mime: 'application/octet-stream',
  };
}

export function exportAky(song: Song): { songFile: ExportBundle; configFile: ExportBundle } {
  const rendered = renderSong(song);
  if (rendered.chip !== 'vectrex') {
    throw new Error('AKY export is for the Vectrex.');
  }
  const encoded = encodeAky(rendered.frames, 'Main');
  const encoder = new TextEncoder();
  return {
    songFile: {
      filename: `${safe(song.name)}.asm`,
      bytes: encoder.encode(encoded.song),
      mime: 'text/plain',
    },
    configFile: {
      filename: `${safe(song.name)}_playerconfig.asm`,
      bytes: encoder.encode(encoded.playerconfig),
      mime: 'text/plain',
    },
  };
}
