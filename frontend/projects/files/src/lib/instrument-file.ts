import {
  baseInstrument,
  defaultRoleForKind,
  instrumentToPresetPatch,
  type ChipId,
  type CustomInstrumentPreset,
  type Instrument,
  type InstrumentKind,
  type InstrumentPatch,
  type PresetRole,
} from '@chippy/domain';

const INSTRUMENT_FILE_VERSION = 1;
const INSTRUMENT_FILE_TYPE = 'chippy-instrument';

const CHIP_IDS: ChipId[] = [
  'gameboy', 'vectrex', 'c64', 'atarist', 'nes', 'genesis', 'pc98', 'x68000',
];
const PRESET_ROLES = new Set<PresetRole>(['lead', 'bass', 'percussion', 'pad', 'fx']);
const INSTRUMENT_KINDS = new Set<InstrumentKind>([
  'pulse', 'wave', 'noise', 'tone', 'snip', 'sid', 'triangle', 'fm',
]);

export interface InstrumentFileDocument {
  version: typeof INSTRUMENT_FILE_VERSION;
  type: typeof INSTRUMENT_FILE_TYPE;
  name: string;
  chip: ChipId;
  kind: InstrumentKind;
  role: PresetRole;
  patch: InstrumentPatch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reject(message: string): never {
  throw new Error(message);
}

function isChipId(value: unknown): value is ChipId {
  return CHIP_IDS.includes(value as ChipId);
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

/** Serialize an instrument into a shareable Chippy instrument file. */
export function serializeInstrumentFile(
  instrument: Instrument,
  chip: ChipId,
  role: PresetRole = defaultRoleForKind(instrument.kind),
): string {
  const doc: InstrumentFileDocument = {
    version: INSTRUMENT_FILE_VERSION,
    type: INSTRUMENT_FILE_TYPE,
    name: instrument.name.trim().slice(0, 40) || 'Instrument',
    chip,
    kind: instrument.kind,
    role,
    patch: instrumentToPresetPatch(instrument),
  };
  return JSON.stringify(doc, null, 2);
}

/** Parse a shareable instrument file into a custom-preset shape (caller assigns id). */
export function parseInstrumentFile(text: string): Omit<CustomInstrumentPreset, 'id'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    reject('Instrument file is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    reject('Instrument file must be a JSON object.');
  }
  if (parsed['version'] !== INSTRUMENT_FILE_VERSION) {
    reject('Unsupported instrument file version.');
  }
  if (parsed['type'] !== INSTRUMENT_FILE_TYPE) {
    reject('Not a Chippy instrument file.');
  }
  const kindRaw = parsed['kind'];
  if (typeof kindRaw !== 'string' || !INSTRUMENT_KINDS.has(kindRaw as InstrumentKind)) {
    reject('Instrument file has an unknown kind.');
  }
  const kind = kindRaw as InstrumentKind;
  if (!isChipId(parsed['chip'])) {
    reject('Instrument file has an unknown chip.');
  }
  const chip = parsed['chip'];
  const roleRaw = parsed['role'];
  const role = typeof roleRaw === 'string' && PRESET_ROLES.has(roleRaw as PresetRole)
    ? (roleRaw as PresetRole)
    : defaultRoleForKind(kind);
  const name = typeof parsed['name'] === 'string' && parsed['name'].trim()
    ? String(parsed['name']).trim().slice(0, 40)
    : 'Imported';
  const patchRaw = isRecord(parsed['patch']) ? parsed['patch'] : {};
  const normalized = baseInstrument({
    ...(patchRaw as InstrumentPatch),
    id: 'tmp',
    name: 'tmp',
    kind,
    volumeMacro: normalizeMacro(patchRaw['volumeMacro']),
    pitchMacro: normalizeMacro(patchRaw['pitchMacro']),
    noiseMacro: normalizeMacro(patchRaw['noiseMacro']),
  });
  const { id: _id, name: _name, ...patch } = normalized;
  return { name, chip, kind, role, patch };
}

export function instrumentDownloadName(name: string): string {
  const safe = name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'instrument';
  return `${safe}.chippy-instrument.json`;
}
