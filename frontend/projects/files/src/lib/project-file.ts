import {
  LEGACY_PROJECT_VERSION,
  LSDJ_MAX_CHAINS,
  LSDJ_MAX_PHRASES,
  LSDJ_TABLE_COUNT,
  PROJECT_VERSION,
  PROJECT_VERSION_V2,
  PROJECT_VERSION_V3,
  PROJECT_VERSION_V4,
  PROJECT_VERSION_V5,
  baseInstrument,
  blankLsdjTable,
  blankTableStep,
  defaultGrooves,
  defaultRoleForKind,
  effectCmdsForChip,
  effectValueMax,
  emptySequence,
  isEffectCmdForChip,
  padChainSteps,
  remapLegacySharedEffectForGameboy,
  syncFlatProjection,
  type Cell,
  type CellEffect,
  type ChipId,
  type CustomInstrumentPreset,
  type EffectCmd,
  type Instrument,
  type InstrumentKind,
  type InstrumentPatch,
  type LsdjChain,
  type LsdjChainStep,
  type LsdjHierarchy,
  type LsdjPhrase,
  type LsdjTable,
  type LsdjTableStep,
  type Pattern,
  type PresetRole,
  type Project,
  type SongBody,
} from '@chippy/domain';

const CHIP_IDS: ChipId[] = [
  'gameboy', 'vectrex', 'c64', 'atarist', 'nes', 'genesis', 'pc98', 'x68000',
];
const PRESET_ROLES = new Set<PresetRole>(['lead', 'bass', 'percussion', 'pad', 'fx']);
const INSTRUMENT_KINDS = new Set<InstrumentKind>([
  'pulse', 'wave', 'noise', 'tone', 'snip', 'sid', 'triangle', 'fm',
]);
const SHARED_ONLY = new Set<EffectCmd>(['A', 'U', 'D', 'R', 'C', 'P']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(message: string): never {
  throw new Error(message);
}

function normalizeMacro(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const steps = raw
    .map((step) => (typeof step === 'number' && Number.isFinite(step) ? Math.round(step) : null))
    .filter((step): step is number => step !== null);
  return steps.length > 0 ? steps : null;
}

function normalizeInstrument(raw: unknown, index: number): Instrument {
  if (!isRecord(raw)) {
    return baseInstrument({ id: `ins-${index + 1}`, name: `Instrument ${index + 1}`, kind: 'pulse' });
  }
  const kind = (typeof raw['kind'] === 'string' ? raw['kind'] : 'pulse') as InstrumentKind;
  const id = typeof raw['id'] === 'string' && raw['id'] ? String(raw['id']) : `ins-${index + 1}`;
  const name = typeof raw['name'] === 'string' && raw['name'] ? String(raw['name']) : `Instrument ${index + 1}`;
  return baseInstrument({
    ...(raw as InstrumentPatch),
    id,
    name,
    kind,
    volumeMacro: normalizeMacro(raw['volumeMacro']),
    pitchMacro: normalizeMacro(raw['pitchMacro']),
    noiseMacro: normalizeMacro(raw['noiseMacro']),
  });
}

function normalizeInstruments(raw: unknown[]): Instrument[] {
  return raw.map((item, index) => normalizeInstrument(item, index));
}

function normalizeEffect(raw: unknown, chip: ChipId, legacySharedGb: boolean): CellEffect | null {
  if (!isRecord(raw)) {
    return null;
  }
  const cmd = raw['cmd'];
  const value = raw['value'];
  if (typeof cmd !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const max = effectValueMax(chip);
  const clamped = Math.min(max, Math.max(0, Math.floor(value)));
  if (chip === 'gameboy' && legacySharedGb && SHARED_ONLY.has(cmd as EffectCmd)) {
    return remapLegacySharedEffectForGameboy({ cmd: cmd as EffectCmd, value: clamped });
  }
  if (!isEffectCmdForChip(chip, cmd)) {
    return null;
  }
  return { cmd: cmd as EffectCmd, value: clamped };
}

function normalizeCell(raw: unknown, chip: ChipId, legacySharedGb: boolean): Cell {
  if (!isRecord(raw)) {
    return { note: null, cut: false, instrumentId: null, volume: null, effect: null };
  }
  return {
    note: typeof raw['note'] === 'number' ? raw['note'] : null,
    cut: Boolean(raw['cut']),
    instrumentId: typeof raw['instrumentId'] === 'string' ? raw['instrumentId'] : null,
    volume: typeof raw['volume'] === 'number' ? raw['volume'] : null,
    effect: normalizeEffect(raw['effect'], chip, legacySharedGb),
  };
}

function normalizePatterns(patterns: Pattern[], chip: ChipId, legacySharedGb: boolean): Pattern[] {
  return patterns.map((pattern, index) => {
    if (!isRecord(pattern as unknown)) {
      return pattern;
    }
    const record = pattern as unknown as Record<string, unknown>;
    const name = typeof record['name'] === 'string' && record['name'].trim()
      ? String(record['name']).trim().slice(0, 40)
      : `Pattern ${index + 1}`;
    const rows = Array.isArray(record['rows'])
      ? (record['rows'] as unknown[]).map((row) =>
          Array.isArray(row) ? row.map((cell) => normalizeCell(cell, chip, legacySharedGb)) : [])
      : pattern.rows.map((row) => row.map((cell) => normalizeCell(cell, chip, legacySharedGb)));
    return { ...pattern, name, rows };
  });
}

function normalizeSongBody(
  raw: Record<string, unknown>,
  index: number,
  chip: ChipId,
  legacySharedGb: boolean,
): SongBody {
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
  const body: SongBody = {
    id,
    name,
    tempo,
    order: order as string[],
    patterns: normalizePatterns(patterns as Pattern[], chip, legacySharedGb),
    lsdj: chip === 'gameboy' ? normalizeLsdjHierarchy(raw['lsdj'], chip, legacySharedGb) : null,
  };
  // The hierarchy is canonical, so order/patterns are rebuilt rather than trusted.
  return body.lsdj ? syncFlatProjection(body) : body;
}

function slotOrNull(raw: unknown, limit: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  const value = Math.round(raw);
  return value >= 0 && value < limit ? value : null;
}

function normalizeChainStep(raw: unknown): LsdjChainStep {
  if (!isRecord(raw)) {
    return { phrase: null, transpose: 0 };
  }
  return {
    phrase: slotOrNull(raw['phrase'], LSDJ_MAX_PHRASES),
    transpose: typeof raw['transpose'] === 'number'
      ? Math.max(-128, Math.min(127, Math.round(raw['transpose'])))
      : 0,
  };
}

function normalizeChain(raw: unknown, index: number): LsdjChain | null {
  if (!isRecord(raw)) {
    return null;
  }
  const slot = slotOrNull(raw['index'], LSDJ_MAX_CHAINS) ?? (index < LSDJ_MAX_CHAINS ? index : null);
  if (slot === null) {
    return null;
  }
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  return {
    index: slot,
    steps: padChainSteps(Array.from({ length: 16 }, (_, i) => normalizeChainStep(stepsRaw[i]))),
  };
}

function normalizePhrase(
  raw: unknown,
  index: number,
  chip: ChipId,
  legacySharedGb: boolean,
): LsdjPhrase | null {
  if (!isRecord(raw)) {
    return null;
  }
  const slot = slotOrNull(raw['index'], LSDJ_MAX_PHRASES) ?? (index < LSDJ_MAX_PHRASES ? index : null);
  if (slot === null) {
    return null;
  }
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  return {
    index: slot,
    steps: Array.from({ length: 16 }, (_, i) => normalizeCell(stepsRaw[i], chip, legacySharedGb)),
  };
}

function normalizeTableStep(raw: unknown, chip: ChipId, legacySharedGb: boolean): LsdjTableStep {
  if (!isRecord(raw)) {
    return blankTableStep();
  }
  const cmd1Raw = typeof raw['cmd1'] === 'string'
    ? normalizeEffect({ cmd: raw['cmd1'], value: typeof raw['cmd1Value'] === 'number' ? raw['cmd1Value'] : 0 }, chip, legacySharedGb)
    : null;
  const cmd2Raw = typeof raw['cmd2'] === 'string'
    ? normalizeEffect({ cmd: raw['cmd2'], value: typeof raw['cmd2Value'] === 'number' ? raw['cmd2Value'] : 0 }, chip, legacySharedGb)
    : null;
  return {
    envelope: typeof raw['envelope'] === 'number' ? raw['envelope'] & 0xff : 0,
    transpose: typeof raw['transpose'] === 'number' ? raw['transpose'] & 0xff : 0,
    cmd1: cmd1Raw?.cmd ?? null,
    cmd1Value: cmd1Raw?.value ?? 0,
    cmd2: cmd2Raw?.cmd ?? null,
    cmd2Value: cmd2Raw?.value ?? 0,
  };
}

function normalizeTable(raw: unknown, index: number, chip: ChipId, legacySharedGb: boolean): LsdjTable | null {
  if (!isRecord(raw)) {
    return null;
  }
  const slot = slotOrNull(raw['index'], LSDJ_TABLE_COUNT) ?? (index < LSDJ_TABLE_COUNT ? index : null);
  if (slot === null) {
    return null;
  }
  const stepsRaw = Array.isArray(raw['steps']) ? raw['steps'] : [];
  return {
    index: slot,
    steps: Array.from({ length: 16 }, (_, i) => normalizeTableStep(stepsRaw[i], chip, legacySharedGb)),
  };
}

function normalizeGrooves(raw: unknown): number[][] {
  const groovesRaw = Array.isArray(raw) ? raw : [];
  return defaultGrooves().map((fallback, g) => {
    const steps = groovesRaw[g];
    if (!Array.isArray(steps)) {
      return fallback;
    }
    return Array.from({ length: 16 }, (_, i) =>
      typeof steps[i] === 'number' ? Math.max(0, Math.min(15, Math.round(steps[i] as number))) : 0,
    );
  });
}

/**
 * v5 stored phrases as 4-channel-wide patterns keyed by string id, which collided when one
 * phrase ran on several channels. Rebuild it as LSDJ does: one single-channel phrase per
 * (phrase, channel) pair actually used by the sequence, deduplicated per channel.
 */
function migrateV5Hierarchy(
  raw: Record<string, unknown>,
  chip: ChipId,
  legacySharedGb: boolean,
): LsdjHierarchy | null {
  const legacyPhrases = Array.isArray(raw['phrases'])
    ? normalizePatterns(raw['phrases'] as Pattern[], chip, legacySharedGb)
    : [];
  const legacyChains = Array.isArray(raw['chains']) ? (raw['chains'] as unknown[]) : [];
  const sequenceRaw = Array.isArray(raw['sequence']) ? raw['sequence'] : [];

  const phrases: LsdjPhrase[] = [];
  const chains: LsdjChain[] = [];
  const sequence = emptySequence();
  const chainByKey = new Map<string, number>();
  const phraseByKey = new Map<string, number>();
  let nextPhrase = 0;
  let nextChain = 0;

  for (let channel = 0; channel < 4; channel += 1) {
    const rows = Array.isArray(sequenceRaw[channel]) ? (sequenceRaw[channel] as unknown[]) : [];
    let songRow = 0;
    for (const chainIdRaw of rows) {
      if (typeof chainIdRaw !== 'string' || songRow >= 256) {
        continue;
      }
      const key = `${chainIdRaw}:${channel}`;
      let slot = chainByKey.get(key);
      if (slot === undefined) {
        if (nextChain >= LSDJ_MAX_CHAINS) {
          break;
        }
        const legacyChain = legacyChains.find(
          (item) => isRecord(item) && item['id'] === chainIdRaw,
        );
        const legacySteps = isRecord(legacyChain) && Array.isArray(legacyChain['steps'])
          ? (legacyChain['steps'] as unknown[])
          : [];
        const steps: LsdjChainStep[] = [];
        for (let i = 0; i < 16; i += 1) {
          const step = legacySteps[i];
          const phraseId = isRecord(step) && typeof step['phraseId'] === 'string'
            ? String(step['phraseId'])
            : null;
          const transpose = isRecord(step) && typeof step['transpose'] === 'number'
            ? Math.max(-128, Math.min(127, Math.round(step['transpose'])))
            : 0;
          if (!phraseId) {
            steps.push({ phrase: null, transpose: 0 });
            continue;
          }
          const phraseKey = `${phraseId}:${channel}`;
          let phraseSlot = phraseByKey.get(phraseKey);
          if (phraseSlot === undefined) {
            if (nextPhrase >= LSDJ_MAX_PHRASES) {
              steps.push({ phrase: null, transpose: 0 });
              continue;
            }
            const legacy = legacyPhrases.find((item) => item.id === phraseId);
            phraseSlot = nextPhrase;
            phrases.push({
              index: phraseSlot,
              steps: Array.from({ length: 16 }, (_, row) =>
                normalizeCell(legacy?.rows?.[row]?.[channel], chip, legacySharedGb),
              ),
            });
            phraseByKey.set(phraseKey, phraseSlot);
            nextPhrase += 1;
          }
          steps.push({ phrase: phraseSlot, transpose });
        }
        slot = nextChain;
        chains.push({ index: slot, steps: padChainSteps(steps) });
        chainByKey.set(key, slot);
        nextChain += 1;
      }
      sequence[channel][songRow] = slot;
      songRow += 1;
    }
  }

  if (phrases.length === 0 || chains.length === 0) {
    return null;
  }

  const tables = Array.isArray(raw['tables'])
    ? (raw['tables'] as unknown[])
      .map((item, index) => normalizeTable(item, index, chip, legacySharedGb))
      .filter((item): item is LsdjTable => item !== null)
    : [blankLsdjTable(0)];

  return {
    enabled: Boolean(raw['enabled']),
    phrases,
    chains,
    sequence,
    grooves: normalizeGrooves(raw['grooves']),
    tables: tables.length > 0 ? tables : [blankLsdjTable(0)],
    activeGroove: typeof raw['activeGroove'] === 'number'
      ? Math.max(0, Math.min(30, Math.round(raw['activeGroove'])))
      : 0,
    focus: { songRow: 0, chainStep: 0 },
  };
}

function normalizeLsdjHierarchy(
  raw: unknown,
  chip: ChipId,
  legacySharedGb: boolean,
): LsdjHierarchy | null {
  if (!isRecord(raw)) {
    return null;
  }
  if ('view' in raw || 'focusChainId' in raw) {
    return migrateV5Hierarchy(raw, chip, legacySharedGb);
  }
  const phrases = Array.isArray(raw['phrases'])
    ? (raw['phrases'] as unknown[])
      .map((item, index) => normalizePhrase(item, index, chip, legacySharedGb))
      .filter((item): item is LsdjPhrase => item !== null)
    : [];
  const chains = Array.isArray(raw['chains'])
    ? (raw['chains'] as unknown[])
      .map((item, index) => normalizeChain(item, index))
      .filter((item): item is LsdjChain => item !== null)
    : [];
  if (phrases.length === 0 || chains.length === 0) {
    return null;
  }
  const sequenceRaw = Array.isArray(raw['sequence']) ? raw['sequence'] : [];
  const sequence = emptySequence();
  for (let channel = 0; channel < 4; channel += 1) {
    const rows = sequenceRaw[channel];
    if (!Array.isArray(rows)) {
      continue;
    }
    for (let row = 0; row < Math.min(rows.length, 256); row += 1) {
      sequence[channel][row] = slotOrNull(rows[row], LSDJ_MAX_CHAINS);
    }
  }
  const tables = Array.isArray(raw['tables'])
    ? (raw['tables'] as unknown[])
      .map((item, index) => normalizeTable(item, index, chip, legacySharedGb))
      .filter((item): item is LsdjTable => item !== null)
    : [];
  const focusRaw = isRecord(raw['focus']) ? raw['focus'] : {};
  return {
    enabled: Boolean(raw['enabled']),
    phrases: [...phrases].sort((a, b) => a.index - b.index),
    chains: [...chains].sort((a, b) => a.index - b.index),
    sequence,
    grooves: normalizeGrooves(raw['grooves']),
    tables: tables.length > 0 ? tables.sort((a, b) => a.index - b.index) : [blankLsdjTable(0)],
    activeGroove: typeof raw['activeGroove'] === 'number'
      ? Math.max(0, Math.min(30, Math.round(raw['activeGroove'])))
      : 0,
    focus: {
      songRow: slotOrNull(focusRaw['songRow'], 256) ?? 0,
      chainStep: slotOrNull(focusRaw['chainStep'], 16) ?? 0,
    },
  };
}

function isChipId(value: unknown): value is ChipId {
  return CHIP_IDS.includes(value as ChipId);
}

function normalizeCustomPreset(raw: unknown, index: number, fallbackChip: ChipId): CustomInstrumentPreset | null {
  if (!isRecord(raw)) {
    return null;
  }
  const kindRaw = raw['kind'];
  if (typeof kindRaw !== 'string' || !INSTRUMENT_KINDS.has(kindRaw as InstrumentKind)) {
    return null;
  }
  const kind = kindRaw as InstrumentKind;
  const chip = isChipId(raw['chip']) ? raw['chip'] : fallbackChip;
  const roleRaw = raw['role'];
  const role = typeof roleRaw === 'string' && PRESET_ROLES.has(roleRaw as PresetRole)
    ? (roleRaw as PresetRole)
    : defaultRoleForKind(kind);
  const id = typeof raw['id'] === 'string' && raw['id'] ? String(raw['id']) : `custom-${index + 1}`;
  const name = typeof raw['name'] === 'string' && raw['name'].trim()
    ? String(raw['name']).trim().slice(0, 40)
    : `Custom ${index + 1}`;
  const patchRaw = isRecord(raw['patch']) ? raw['patch'] : raw;
  const normalized = normalizeInstrument({ ...patchRaw, kind, id: 'tmp', name: 'tmp' }, index);
  const { id: _id, name: _name, ...patch } = normalized;
  return { id, name, chip, kind, role, patch };
}

function normalizeCustomPresets(raw: unknown, chip: ChipId): CustomInstrumentPreset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index) => normalizeCustomPreset(item, index, chip))
    .filter((item): item is CustomInstrumentPreset => item !== null);
}

function migrateV1(parsed: Record<string, unknown>): Project {
  const chip = parsed['chip'];
  if (!isChipId(chip)) {
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
  const legacySharedGb = chip === 'gameboy';
  const body: SongBody = {
    id: 'song-1',
    name: typeof parsed['name'] === 'string' && parsed['name'] ? String(parsed['name']) : 'Song 1',
    tempo: typeof parsed['tempo'] === 'number' ? parsed['tempo'] : 120,
    order: parsed['order'] as string[],
    patterns: normalizePatterns(parsed['patterns'] as Pattern[], chip, legacySharedGb),
    lsdj: null,
  };
  return {
    version: PROJECT_VERSION,
    name: typeof parsed['name'] === 'string' ? String(parsed['name']) : 'Untitled',
    chip,
    instruments: normalizeInstruments(parsed['instruments'] as unknown[]),
    armedInstrumentId: String(parsed['armedInstrumentId'] ?? ''),
    songs: [body],
    activeSongId: body.id,
    customPresets: [],
  };
}

function parseProjectBody(
  parsed: Record<string, unknown>,
  allowCustom: boolean,
  legacySharedGb: boolean,
): Project {
  const allowed = new Set([
    'version', 'name', 'chip', 'instruments', 'armedInstrumentId', 'songs', 'activeSongId',
  ]);
  if (allowCustom) {
    allowed.add('customPresets');
  }
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) {
      reject(`Unknown project field "${key}".`);
    }
  }
  const chip = parsed['chip'];
  if (!isChipId(chip)) {
    reject('Unknown chip.');
  }
  if (!Array.isArray(parsed['instruments']) || parsed['instruments'].length === 0) {
    reject('The project has no instruments.');
  }
  if (!Array.isArray(parsed['songs']) || parsed['songs'].length === 0) {
    reject('The project has no songs.');
  }
  const remap = legacySharedGb && chip === 'gameboy';
  const songs = (parsed['songs'] as unknown[]).map((item, index) => {
    if (!isRecord(item)) {
      reject('Invalid song entry.');
    }
    return normalizeSongBody(item, index, chip, remap);
  });
  const activeSongId = typeof parsed['activeSongId'] === 'string' && songs.some((song) => song.id === parsed['activeSongId'])
    ? String(parsed['activeSongId'])
    : songs[0].id;
  return {
    version: PROJECT_VERSION,
    name: typeof parsed['name'] === 'string' ? String(parsed['name']) : 'Untitled',
    chip,
    instruments: normalizeInstruments(parsed['instruments'] as unknown[]),
    armedInstrumentId: String(parsed['armedInstrumentId'] ?? ''),
    songs,
    activeSongId,
    customPresets: allowCustom ? normalizeCustomPresets(parsed['customPresets'], chip) : [],
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
  if (version === PROJECT_VERSION_V2) {
    return parseProjectBody(parsed, false, true);
  }
  if (version === PROJECT_VERSION_V3) {
    return parseProjectBody(parsed, true, true);
  }
  if (version === PROJECT_VERSION_V4 || version === PROJECT_VERSION_V5) {
    return parseProjectBody(parsed, true, false);
  }
  if (version !== PROJECT_VERSION) {
    reject('Unsupported project version.');
  }
  const project = parseProjectBody(parsed, true, false);
  if (!CHIP_IDS.includes(project.chip)) {
    reject('Unknown chip.');
  }
  // Touch effectCmdsForChip so tree-shaking keeps the helper available to callers.
  void effectCmdsForChip(project.chip);
  return project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({
    ...project,
    version: PROJECT_VERSION,
    customPresets: project.customPresets ?? [],
  }, null, 2);
}

export function downloadName(project: { name: string }, extension: string): string {
  const safe = project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'chippy';
  return `${safe}.${extension}`;
}

export type { Instrument, Project };
