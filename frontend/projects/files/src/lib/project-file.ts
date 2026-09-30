import { PROJECT_VERSION, type ChipId, type Instrument, type Song } from '@chippy/domain';

const CHIP_IDS: ChipId[] = ['gameboy', 'vectrex'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(message: string): never {
  throw new Error(message);
}

/** Parse a Chippy project and drop anything that is not part of the document. */
export function parseProject(raw: string): Song {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reject('The file is not JSON.');
  }
  if (!isRecord(parsed)) {
    reject('The project must be a JSON object.');
  }
  const allowed = new Set([
    'version', 'name', 'chip', 'tempo', 'order', 'patterns', 'instruments', 'armedInstrumentId',
  ]);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) {
      reject(`Unknown project field "${key}".`);
    }
  }
  if (parsed['version'] !== PROJECT_VERSION) {
    reject('Unsupported project version.');
  }
  const chip = parsed['chip'];
  if (chip !== 'gameboy' && chip !== 'vectrex') {
    reject('Unknown chip.');
  }
  const song = parsed as unknown as Song;
  if (!Array.isArray(song.patterns) || song.patterns.length === 0) {
    reject('The project has no patterns.');
  }
  if (!Array.isArray(song.instruments) || song.instruments.length === 0) {
    reject('The project has no instruments.');
  }
  if (!CHIP_IDS.includes(song.chip)) {
    reject('Unknown chip.');
  }
  return song;
}

export function serializeProject(song: Song): string {
  return JSON.stringify(song, null, 2);
}

export function downloadName(song: Song, extension: string): string {
  const safe = song.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'chippy';
  return `${safe}.${extension}`;
}

export type { Instrument };
