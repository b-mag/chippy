/** A pattern is sixteen rows, short enough to see at once. */
export const PATTERN_ROWS = 16;

/** Version of the `.chippy.json` document. Unknown versions are rejected. */
export const PROJECT_VERSION = 2;

/** Legacy flat-document version still accepted on open and migrated to v2. */
export const LEGACY_PROJECT_VERSION = 1;

export type ChipId = 'gameboy' | 'vectrex' | 'c64';

export type ColumnId = 'note' | 'instrument' | 'volume' | 'effect';

/**
 * Shared FX commands (common-denominator tracker column).
 * Engines that do not implement a command ignore it.
 * - A: volume slide down by `value` each frame (0-15)
 * - U: volume slide up by `value` each frame (0-15)
 * - D: delay note onset by `value` frames into the row (0-15)
 * - R: retrigger / re-gate every `value` frames (1-15)
 * - C: cut note after `value` frames (0 = cut on the first tick)
 * - P: pitch slide; each frame nudge MIDI by `((value & 0x0f) - 8)` (8 = hold)
 */
export type EffectCmd = 'A' | 'U' | 'D' | 'R' | 'C' | 'P';

export interface CellEffect {
  cmd: EffectCmd;
  value: number;
}

export type InstrumentKind = 'pulse' | 'wave' | 'noise' | 'tone' | 'snip' | 'sid';

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
}

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

export const EFFECT_CMDS: EffectCmd[] = ['A', 'U', 'D', 'R', 'C', 'P'];

export function formatEffect(effect: CellEffect | null): string {
  if (!effect) {
    return '..';
  }
  return `${effect.cmd}${effect.value.toString(16).toUpperCase()}`;
}
