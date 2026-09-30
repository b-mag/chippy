import {
  LEGACY_PROJECT_VERSION,
  PROJECT_VERSION,
  type ChipId,
  type Instrument,
  type Pattern,
  type Project,
  type SongBody,
} from '@chippy/domain';

const CHIP_IDS: ChipId[] = ['gameboy', 'vectrex'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(message: string): never {
  throw new Error(message);
}

function normalizePatterns(patterns: Pattern[]): Pattern[] {
  return patterns.map((pattern, index) => {
    if (!isRecord(pattern as unknown)) {
      return pattern;
    }
    const record = pattern as unknown as Record<string, unknown>;
    const name = typeof record['name'] === 'string' && record['name'].trim()
      ? String(record['name']).trim().slice(0, 40)
      : `Pattern ${index + 1}`;
    return { ...pattern, name };
  });
}

function normalizeSongBody(raw: Record<string, unknown>, index: number): SongBody {
  const id = typeof raw['id'] === 'string' && raw['id'] ? String(raw['id']) : `song-${index + 1}`;
  const name = typeof raw['name'] === 'string' && raw['name'].trim()
    ? String(raw['name']).trim().slice(0, 40)
    : `Song ${index + 1}`;
  const tempo = typeof raw['tempo'] === 'number' ? raw['tempo'] : 120;
  const order = raw['order'];
  const patterns = raw['patterns'];
  if (!Array.isArray(order) || order.length === 0) {
    reject('A song has no order.');
  }
  if (!Array.isArray(patterns) || patterns.length === 0) {
    reject('A song has no patterns.');
  }
  return {
    id,
    name,
    tempo,
    order: order as string[],
    patterns: normalizePatterns(patterns as Pattern[]),
  };
}

function migrateV1(parsed: Record<string, unknown>): Project {
  const chip = parsed['chip'];
  if (chip !== 'gameboy' && chip !== 'vectrex') {
    reject('Unknown chip.');
  }
  if (!Array.isArray(parsed['patterns']) || parsed['patterns'].length === 0) {
    reject('The project has no patterns.');
  }
  if (!Array.isArray(parsed['instruments']) || parsed['instruments'].length === 0) {
    reject('The project has no instruments.');
  }
  if (!Array.isArray(parsed['order']) || parsed['order'].length === 0) {
    reject('The project has no order.');
  }
  const body: SongBody = {
    id: 'song-1',
    name: typeof parsed['name'] === 'string' && parsed['name'] ? String(parsed['name']) : 'Song 1',
    tempo: typeof parsed['tempo'] === 'number' ? parsed['tempo'] : 120,
    order: parsed['order'] as string[],
    patterns: normalizePatterns(parsed['patterns'] as Pattern[]),
  };
  return {
    version: PROJECT_VERSION,
    name: typeof parsed['name'] === 'string' ? String(parsed['name']) : 'Untitled',
    chip,
    instruments: parsed['instruments'] as Instrument[],
    armedInstrumentId: String(parsed['armedInstrumentId'] ?? ''),
    songs: [body],
    activeSongId: body.id,
  };
}

function parseV2(parsed: Record<string, unknown>): Project {
  const allowed = new Set([
    'version', 'name', 'chip', 'instruments', 'armedInstrumentId', 'songs', 'activeSongId',
  ]);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) {
      reject(`Unknown project field "${key}".`);
    }
  }
  const chip = parsed['chip'];
  if (chip !== 'gameboy' && chip !== 'vectrex') {
    reject('Unknown chip.');
  }
  if (!Array.isArray(parsed['instruments']) || parsed['instruments'].length === 0) {
    reject('The project has no instruments.');
  }
  if (!Array.isArray(parsed['songs']) || parsed['songs'].length === 0) {
    reject('The project has no songs.');
  }
  const songs = (parsed['songs'] as unknown[]).map((item, index) => {
    if (!isRecord(item)) {
      reject('Invalid song entry.');
    }
    return normalizeSongBody(item, index);
  });
  const activeSongId = typeof parsed['activeSongId'] === 'string' && songs.some((song) => song.id === parsed['activeSongId'])
    ? String(parsed['activeSongId'])
    : songs[0].id;
  return {
    version: PROJECT_VERSION,
    name: typeof parsed['name'] === 'string' ? String(parsed['name']) : 'Untitled',
    chip,
    instruments: parsed['instruments'] as Instrument[],
    armedInstrumentId: String(parsed['armedInstrumentId'] ?? ''),
    songs,
    activeSongId,
  };
}

/** Parse a Chippy project and drop anything that is not part of the document. */
export function parseProject(raw: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reject('The file is not JSON.');
  }
  if (!isRecord(parsed)) {
    reject('The project must be a JSON object.');
  }
  const version = parsed['version'];
  if (version === LEGACY_PROJECT_VERSION) {
    const allowed = new Set([
      'version', 'name', 'chip', 'tempo', 'order', 'patterns', 'instruments', 'armedInstrumentId',
    ]);
    for (const key of Object.keys(parsed)) {
      if (!allowed.has(key)) {
        reject(`Unknown project field "${key}".`);
      }
    }
    return migrateV1(parsed);
  }
  if (version !== PROJECT_VERSION) {
    reject('Unsupported project version.');
  }
  const project = parseV2(parsed);
  if (!CHIP_IDS.includes(project.chip)) {
    reject('Unknown chip.');
  }
  return project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, version: PROJECT_VERSION }, null, 2);
}

export function downloadName(project: { name: string }, extension: string): string {
  const safe = project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'chippy';
  return `${safe}.${extension}`;
}

export type { Instrument, Project };
