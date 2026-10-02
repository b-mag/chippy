/** A pattern is sixteen rows, short enough to see at once. */
export const PATTERN_ROWS = 16;

/** Version of the `.chippy.json` document. Unknown versions are rejected. */
export const PROJECT_VERSION = 6;

/** v5 projects (string-keyed LSDJ hierarchy) still accepted on open and migrated to v6. */
export const PROJECT_VERSION_V5 = 5;

/** v4 projects (pre–LSDJ mode) still accepted on open and migrated to v6. */
export const PROJECT_VERSION_V4 = 4;

/** v3 projects (customPresets) still accepted on open and migrated to v6. */
export const PROJECT_VERSION_V3 = 3;

/** Flat multi-song project version still accepted on open and migrated to v6. */
export const PROJECT_VERSION_V2 = 2;

/** Legacy flat-document version still accepted on open and migrated to v6. */
export const LEGACY_PROJECT_VERSION = 1;

/** Musical role used to group presets in the instrument studio. */
export type PresetRole = 'lead' | 'bass' | 'percussion' | 'pad' | 'fx';

export type ChipId =
  | 'gameboy'
  | 'vectrex'
  | 'c64'
  | 'atarist'
  | 'nes'
  | 'genesis'
  | 'pc98'
  | 'x68000';

export type ColumnId = 'note' | 'instrument' | 'volume' | 'effect';

/**
 * Tracker FX command letter.
 * Non-Game-Boy chips use the shared subset (see SHARED_EFFECT_CMDS).
 * Game Boy uses the LSDJ phrase command set (see LSDJ_EFFECT_CMDS).
 */
export type EffectCmd =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'K'
  | 'L'
  | 'M'
  | 'O'
  | 'P'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'Z';

export interface CellEffect {
  cmd: EffectCmd;
  /** 0-15 on shared chips; 0-255 (hex byte) on Game Boy / LSDJ. */
  value: number;
}

export type InstrumentKind = 'pulse' | 'wave' | 'noise' | 'tone' | 'snip' | 'sid' | 'triangle' | 'fm';

/**
 * One Yamaha-style four-operator slot (OPN / OPN2 / OPNA / OPM).
 * Ranges follow the hardware registers so an exporter can map them later.
 */
export interface FmOperator {
  /** Detune, 0-7. 0-3 detune up, 4-7 detune down. */
  dt: number;
  /** Frequency multiple, 0-15. 0 means one half. */
  mul: number;
  /** Total level, 0-127. 0 is loudest. */
  tl: number;
  /** Key scale / rate scaling, 0-3. */
  ks: number;
  /** Attack rate, 0-31. */
  ar: number;
  /** First decay rate, 0-31. */
  dr: number;
  /** Second decay (sustain) rate, 0-31. */
  sr: number;
  /** Release rate, 0-15. */
  rr: number;
  /** Sustain level, 0-15. 15 is near silence. */
  sl: number;
  /** SSG-EG mode, 0-15. 0 is off. OPN family only; OPM ignores it. */
  ssgEg: number;
}

/** A four-operator FM voice: routing, feedback, LFO depth, and the operators. */
export interface FmPatch {
  /** Operator connection, 0-7. */
  algorithm: number;
  /** Operator 1 self-feedback, 0-7. */
  feedback: number;
  /** Amplitude modulation sensitivity, 0-3. */
  ams: number;
  /** Pitch modulation sensitivity, 0-7. */
  pms: number;
  lfoEnable: boolean;
  /** LFO speed, 0-7. */
  lfoFrequency: number;
  operators: [FmOperator, FmOperator, FmOperator, FmOperator];
}

/** One step on one channel. Empty means the previous note keeps sounding. */
export interface Cell {
  /** MIDI note number. Null when the cell is empty or a cut. */
  note: number | null;
  cut: boolean;
  instrumentId: string | null;
  /** Chip volume 0 through 15. Null keeps the instrument's own level. */
  volume: number | null;
  /** Optional effect. Null means no FX on this step. */
  effect: CellEffect | null;
}

export interface Pattern {
  id: string;
  /** Display name in the Song Order panel. Older files may omit this. */
  name: string;
  rows: Cell[][];
}

/**
 * A sound the note column can point at.
 * Fields that a chip does not use stay at their defaults and are ignored
 * by that chip's engine.
 */
export interface Instrument {
  id: string;
  name: string;
  kind: InstrumentKind;
  /** Pulse duty: 0 = 12.5%, 1 = 25%, 2 = 50%, 3 = 75%. */
  duty: 0 | 1 | 2 | 3;
  envelopeStart: number;
  envelopeDown: boolean;
  envelopePeriod: number;
  sweepTime: number;
  sweepDown: boolean;
  sweepShift: number;
  /** Index into the built-in Game Boy waveforms. */
  waveform: number;
  noiseShort: boolean;
  /** AY hardware envelope. The phase-1 AKY encoder rejects this; use YM6. */
  hardwareEnvelope: boolean;
  /** Vectrex noise mixer on this channel. AKY phase-1 does not encode noise; use YM6. */
  mixNoise: boolean;
  /** AY noise period register R6 (0–31). */
  noisePeriod: number;
  /** AY hardware envelope period (R11–R12), 0–65535. */
  hardwareEnvelopePeriod: number;
  /** AY hardware envelope shape (R13), 0–15. */
  hardwareEnvelopeShape: number;
  /**
   * Optional per-frame volume macro (0–15). Indexed by frames since note-on.
   * Null or empty means unused. Soft envelopes and macros export via YM6;
   * AKY carries the baked volume/period stream when noise/HW envelope are off.
   */
  volumeMacro: number[] | null;
  /** Optional per-frame pitch offset in semitones. Null or empty means unused. */
  pitchMacro: number[] | null;
  /** Optional per-frame noise period macro (0–31). Null or empty means unused. */
  noiseMacro: number[] | null;
  /**
   * Captured YM frames (16 register bytes each) for a snip instrument.
   * Playback uses the loudest tone in each frame on the channel that
   * triggered the instrument.
   */
  frames: number[][] | null;
  /** SID attack rate 0-15. */
  attack: number;
  /** SID decay rate 0-15. */
  decay: number;
  /** SID sustain level 0-15. */
  sustain: number;
  /** SID release rate 0-15. */
  release: number;
  waveTriangle: boolean;
  waveSaw: boolean;
  wavePulse: boolean;
  waveNoise: boolean;
  /** SID pulse width 0-4095 (12-bit). */
  pulseWidth: number;
  ringMod: boolean;
  sync: boolean;
  filterEnable: boolean;
  /** Filter cutoff 0-2047. */
  filterCutoff: number;
  /** Filter resonance 0-15. */
  filterResonance: number;
  /** 0 = low, 1 = band, 2 = high. */
  filterMode: 0 | 1 | 2;
  /** Four-operator patch. Present on every instrument; only FM chips read it. */
  fm: FmPatch;
}

/**
 * Instrument overrides stored by a preset or an instrument file.
 * The FM patch may be partial; defaults fill the rest in on load.
 */
export type InstrumentPatch = Partial<Omit<Instrument, 'fm'>> & {
  fm?: Partial<Omit<FmPatch, 'operators'>> & { operators?: Partial<FmOperator>[] };
};

/** One song inside a project. Patterns and order live here; instruments do not. */
export interface SongBody {
  id: string;
  name: string;
  /**
   * Quarter-note tempo in beats per minute.
   * A pattern row is a sixteenth note, so row rate is `tempo * 4 / 60`.
   */
  tempo: number;
  order: string[];
  patterns: Pattern[];
  /**
   * Game Boy LSDJ hierarchy. Absent for flat Chippy songs. Once present it is canonical:
   * phrases/chains/sequence drive `order` / `patterns`, which become a derived projection.
   */
  lsdj?: import('./lsdj-hierarchy').LsdjHierarchy | null;
}

/**
 * User-saved instrument template stored on the project (not a global library).
 * `chip` is recorded so multi-chip projects can filter later.
 */
export interface CustomInstrumentPreset {
  id: string;
  name: string;
  chip: ChipId;
  kind: InstrumentKind;
  role: PresetRole;
  /** Field overrides applied on top of a fresh instrument of `kind`. */
  patch: InstrumentPatch;
}

/**
 * Editable Chippy document: one chip, a shared instrument bank, and one or more songs.
 */
export interface Project {
  version: typeof PROJECT_VERSION;
  name: string;
  chip: ChipId;
  instruments: Instrument[];
  armedInstrumentId: string;
  songs: SongBody[];
  activeSongId: string;
  /** Project-scoped reusable instrument templates. */
  customPresets: CustomInstrumentPreset[];
}

/**
 * Flat render / playback view of the active song plus the project instrument bank.
 * Engines and exporters consume this shape.
 */
export interface Song {
  name: string;
  chip: ChipId;
  tempo: number;
  order: string[];
  patterns: Pattern[];
  instruments: Instrument[];
  armedInstrumentId: string;
}

export interface Cursor {
  orderIndex: number;
  row: number;
  channel: number;
  column: ColumnId;
}

/**
 * Shared FX (common-denominator tracker column).
 * - A: volume slide down by `value` each frame (0-15)
 * - U: volume slide up by `value` each frame (0-15)
 * - D: delay note onset by `value` frames into the row (0-15)
 * - R: retrigger / re-gate every `value` frames (1-15)
 * - C: cut note after `value` frames (0 = cut on the first tick)
 * - P: pitch slide; each frame nudge MIDI by `((value & 0x0f) - 8)` (8 = hold)
 */
export const SHARED_EFFECT_CMDS: EffectCmd[] = ['A', 'U', 'D', 'R', 'C', 'P'];

/** LSDJ phrase commands (Game Boy). Values are full bytes 00-FF. */
export const LSDJ_EFFECT_CMDS: EffectCmd[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'O', 'P', 'R', 'S', 'T', 'V', 'W', 'Z',
];

/** @deprecated Prefer SHARED_EFFECT_CMDS or effectCmdsForChip. */
export const EFFECT_CMDS: EffectCmd[] = SHARED_EFFECT_CMDS;

export function effectCmdsForChip(chip: ChipId): readonly EffectCmd[] {
  return chip === 'gameboy' ? LSDJ_EFFECT_CMDS : SHARED_EFFECT_CMDS;
}

export function effectValueMax(chip: ChipId): number {
  return chip === 'gameboy' ? 255 : 15;
}

export function isEffectCmdForChip(chip: ChipId, cmd: string): cmd is EffectCmd {
  return (effectCmdsForChip(chip) as readonly string[]).includes(cmd);
}

/**
 * Map pre-LSDJ shared Game Boy FX onto LSDJ commands.
 * Used when loading older Chippy GB projects that only had A/U/D/R/C/P.
 */
export function remapLegacySharedEffectForGameboy(effect: CellEffect): CellEffect | null {
  const value = Math.min(15, Math.max(0, effect.value | 0));
  switch (effect.cmd) {
    case 'C':
      return { cmd: 'K', value };
    case 'D':
    case 'R':
      return { cmd: effect.cmd, value };
    case 'P':
      // Old nibble 8 = hold; LSDJ P is a signed-ish bend speed — keep low nibble.
      return { cmd: 'P', value };
    case 'A':
      // Volume slide down → falling envelope (approx).
      return { cmd: 'E', value: 0xa0 | (value & 0x07) };
    case 'U':
      // Volume slide up → rising envelope (approx).
      return { cmd: 'E', value: 0x88 | (value & 0x07) };
    default:
      return isEffectCmdForChip('gameboy', effect.cmd)
        ? { cmd: effect.cmd, value: Math.min(255, Math.max(0, effect.value | 0)) }
        : null;
  }
}

export function formatEffect(effect: CellEffect | null, chip?: ChipId): string {
  if (!effect) {
    return chip === 'gameboy' ? '...' : '..';
  }
  if (chip === 'gameboy' || effect.value > 15) {
    return `${effect.cmd}${effect.value.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return `${effect.cmd}${effect.value.toString(16).toUpperCase()}`;
}
