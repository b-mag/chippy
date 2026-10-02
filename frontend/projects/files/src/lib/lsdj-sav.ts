import {
  baseInstrument,
  emptyCell,
  PATTERN_ROWS,
  PROJECT_VERSION,
  type Cell,
  type EffectCmd,
  type Instrument,
  type InstrumentKind,
  type LsdjImportMap,
  type LsdjPhraseRef,
  type Pattern,
  type Project,
  type Song,
} from '@chippy/domain';
import { WAVEFORMS } from '@chippy/engines';
import { createEmptyLsdjSong } from './lsdj-empty-song';

export type { LsdjImportMap, LsdjPhraseRef };

/** Full LSDJ .sav size (128 KiB). */
export const LSDJ_SAV_SIZE = 0x20000;
/** Format version of the vendored empty work-song template (libLSDJ). */
export const LSDJ_GREENFIELD_FORMAT_VERSION = 7;
/** Lowest format version Chippy accepts without a hard reject. */
export const LSDJ_FORMAT_VERSION_MIN = 5;
/** Highest format version Chippy treats as known; newer still imports with a warning. */
export const LSDJ_FORMAT_VERSION_MAX = 16;

const SONG_SIZE = 0x8000;
const BLOCK_COUNT = 191;
const PROJECT_COUNT = 32;
const PROJECT_NAME_LENGTH = 8;
const NO_CHAIN = 0xff;
const NO_PHRASE = 0xff;
const NO_INSTRUMENT = 0xff;
const NO_NOTE = 0;
const PHRASE_LENGTH = 16;
const CHAIN_LENGTH = 16;
const MAX_PHRASES = 255;
const MAX_CHAINS = 128;
const MAX_INSTRUMENTS = 64;
const MAX_SEQUENCE_ROWS = 256;

const OFF = {
  phraseNotes: 0x0000,
  grooves: 0x1090,
  sequence: 0x1290,
  rb1: 0x1e78,
  instrumentNames: 0x1e7a,
  instrAlloc: 0x2040,
  chainPhrases: 0x2080,
  chainTransposes: 0x2880,
  instruments: 0x3080,
  rb2: 0x3e80,
  phraseAlloc: 0x3e82,
  chainAlloc: 0x3ea2,
  tempo: 0x3fb4,
  phraseCommands: 0x4000,
  phraseCommandValues: 0x4ff0,
  waves: 0x6000,
  phraseInstruments: 0x7000,
  rb3: 0x7ff0,
  formatVersion: 0x7fff,
} as const;

/** libLSDJ / LSDJ command enum (B is last historically). */
const LSDJ_CMD_BYTE: Record<EffectCmd, number> = {
  A: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  H: 7,
  K: 8,
  L: 9,
  M: 10,
  O: 11,
  P: 12,
  R: 13,
  S: 14,
  T: 15,
  V: 16,
  W: 17,
  Z: 18,
  B: 23,
  U: 0, // not an LSDJ command; should not appear after remap
};

const LSDJ_BYTE_TO_CMD: Record<number, EffectCmd> = {
  1: 'A',
  2: 'C',
  3: 'D',
  4: 'E',
  5: 'F',
  6: 'G',
  7: 'H',
  8: 'K',
  9: 'L',
  10: 'M',
  11: 'O',
  12: 'P',
  13: 'R',
  14: 'S',
  15: 'T',
  16: 'V',
  17: 'W',
  18: 'Z',
  23: 'B',
};

/** Options for `.sav` export. */
export interface LsdjEncodeOptions {
  /** Original opened `.sav`; enables patch-in-place preserve mode. */
  baseSav?: Uint8Array | null;
  /** Phrase/instrument map from decode; required with baseSav for phrase patches. */
  importMap?: LsdjImportMap | null;
  /**
   * False when the user has not changed the project since opening the `.sav`.
   * With baseSav, encode returns a byte-identical clone (identity invariant).
   */
  modified?: boolean;
}

/** Result of opening an LSDJ `.sav` into Chippy's flat Song model. */
export interface LsdjDecodeResult {
  song: Song;
  warnings: string[];
  formatVersion: number;
  importMap: LsdjImportMap;
}

function setBit(table: Uint8Array, index: number): void {
  table[index >> 3] |= 1 << (index & 7);
}

function writeName(target: Uint8Array, offset: number, name: string, length: number): void {
  const bytes = new TextEncoder().encode(name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length));
  target.fill(0, offset, offset + length);
  target.set(bytes.subarray(0, length), offset);
}

function envelopeByte(instrument: Instrument): number {
  const start = Math.min(15, Math.max(0, instrument.envelopeStart | 0));
  const direction = instrument.envelopeDown === false ? 1 : 0;
  const period = instrument.envelopePeriod & 0x07;
  return ((start & 0x0f) << 4) | (direction << 3) | period;
}

function pulseSweepByte(instrument: Instrument): number {
  const sweepTime = instrument.sweepTime & 7;
  const sweepShift = instrument.sweepShift & 7;
  const sweepNeg = instrument.sweepDown ? 1 : 0;
  return sweepTime === 0 && sweepShift === 0
    ? 0xff
    : ((sweepTime & 7) << 4) | (sweepNeg << 3) | (sweepShift & 7);
}

function waveVolumeByte(instrument: Instrument): number {
  const vol = Math.min(15, Math.max(0, instrument.envelopeStart | 0));
  // Wave volume: 0%, 25%, 50%, 100% in bits 6-5.
  return vol >= 12 ? 0x60 : vol >= 6 ? 0x40 : vol > 0 ? 0x20 : 0x00;
}

function writePulseInstrument(dest: Uint8Array, instrument: Instrument): void {
  dest.fill(0);
  dest[0] = 0; // pulse
  dest[1] = envelopeByte(instrument);
  dest[2] = 0;
  dest[3] = 0; // unlimited length
  dest[4] = pulseSweepByte(instrument);
  dest[5] = 0;
  dest[6] = 0; // table off
  dest[7] = ((instrument.duty & 3) << 6) | 0x03; // duty + LR
  dest[8] = 0;
  dest[9] = 0;
  dest[10] = 0xd0;
  dest[11] = 0;
}

function writeWaveInstrument(dest: Uint8Array, instrument: Instrument): void {
  dest.fill(0);
  dest[0] = 1;
  dest[1] = waveVolumeByte(instrument);
  dest[2] = 0;
  dest[3] = (instrument.waveform & 0x0f); // wave frame in synth 0
  dest[5] = 0;
  dest[6] = 0;
  dest[7] = 0x03;
  dest[9] = 1; // play once
  dest[10] = 0x0f;
  dest[11] = 4;
}

function writeNoiseInstrument(dest: Uint8Array, instrument: Instrument): void {
  dest.fill(0);
  dest[0] = 3;
  dest[1] = envelopeByte(instrument);
  dest[2] = instrument.noiseShort ? 1 : 0; // pitch safe/free approx
  dest[3] = 0;
  dest[4] = 0;
  dest[6] = 0;
  dest[7] = 0x03;
}

/**
 * Patch Chippy-owned pulse/wave/noise fields into an existing 16-byte slot.
 * Leaves table link, vibrato/pitch flags, length, panning, finetune, kit bits, etc.
 */
function mergeInstrumentFields(dest: Uint8Array, instrument: Instrument): void {
  if (instrument.kind === 'wave') {
    dest[0] = 1;
    dest[1] = (dest[1] & ~0x60) | waveVolumeByte(instrument);
    dest[3] = (dest[3] & 0xf0) | (instrument.waveform & 0x0f);
    return;
  }
  if (instrument.kind === 'noise') {
    dest[0] = 3;
    dest[1] = envelopeByte(instrument);
    dest[2] = (dest[2] & ~0x01) | (instrument.noiseShort ? 1 : 0);
    return;
  }
  dest[0] = 0;
  dest[1] = envelopeByte(instrument);
  dest[4] = pulseSweepByte(instrument);
  dest[7] = (dest[7] & 0x3f) | ((instrument.duty & 3) << 6);
}

function writeInstrument(song: Uint8Array, index: number, instrument: Instrument): void {
  const base = OFF.instruments + index * 16;
  const dest = song.subarray(base, base + 16);
  if (instrument.kind === 'wave') {
    writeWaveInstrument(dest, instrument);
  } else if (instrument.kind === 'noise') {
    writeNoiseInstrument(dest, instrument);
  } else {
    writePulseInstrument(dest, instrument);
  }
  writeName(song, OFF.instrumentNames + index * 5, instrument.name, 5);
  song[OFF.instrAlloc + index] = 1;
}

/** Merge Chippy edits into pulse/wave/noise slots listed in the import map. */
function mergeEditableInstruments(
  songBytes: Uint8Array,
  instruments: Instrument[],
  editableIndices: number[],
): void {
  const byIndex = new Map<number, Instrument>();
  for (const instrument of instruments) {
    const match = /^ins-(\d+)$/.exec(instrument.id);
    if (!match) {
      continue;
    }
    byIndex.set(Number(match[1]) - 1, instrument);
  }
  for (const index of editableIndices) {
    if (index < 0 || index >= MAX_INSTRUMENTS) {
      continue;
    }
    const instrument = byIndex.get(index);
    if (!instrument) {
      continue;
    }
    if (instrument.kind !== 'pulse' && instrument.kind !== 'wave' && instrument.kind !== 'noise') {
      continue;
    }
    const dest = songBytes.subarray(OFF.instruments + index * 16, OFF.instruments + index * 16 + 16);
    // Never rewrite kit slots even if the Chippy side was remapped to pulse for display.
    if (dest[0] === 2) {
      continue;
    }
    mergeInstrumentFields(dest, instrument);
    writeName(songBytes, OFF.instrumentNames + index * 5, instrument.name, 5);
  }
}

function writeWaveforms(song: Uint8Array): void {
  // Synth 0, waves 0-3: pack Chippy's 32-nibble waveforms as 16 bytes each.
  for (let wave = 0; wave < WAVEFORMS.length && wave < 16; wave += 1) {
    const samples = WAVEFORMS[wave];
    const offset = OFF.waves + wave * 16;
    for (let i = 0; i < 16; i += 1) {
      const high = samples[i * 2] & 0x0f;
      const low = samples[i * 2 + 1] & 0x0f;
      song[offset + i] = (high << 4) | low;
    }
  }
}

function commandByte(cmd: EffectCmd | null): number {
  if (!cmd) {
    return 0;
  }
  return LSDJ_CMD_BYTE[cmd] ?? 0;
}

function stepCommand(cell: Cell): { cmd: number; value: number } {
  if (cell.effect && commandByte(cell.effect.cmd) !== 0) {
    return { cmd: commandByte(cell.effect.cmd), value: cell.effect.value & 0xff };
  }
  if (cell.cut) {
    return { cmd: LSDJ_CMD_BYTE.K, value: 0 };
  }
  if (cell.volume !== null) {
    // Amplitude envelope with sustain-ish: high nibble = volume, low = no change (8).
    return { cmd: LSDJ_CMD_BYTE.E, value: ((cell.volume & 0x0f) << 4) | 0x08 };
  }
  return { cmd: 0, value: 0 };
}

function writePhrase(
  song: Uint8Array,
  phrase: number,
  cells: Cell[],
  instrumentIndex: (id: string | null) => number,
  transpose = 0,
  touchAlloc = true,
): void {
  for (let step = 0; step < PHRASE_LENGTH; step += 1) {
    const cell = cells[step] ?? { note: null, cut: false, instrumentId: null, volume: null, effect: null };
    let note = NO_NOTE;
    if (!cell.cut && cell.note !== null) {
      note = Math.min(127, Math.max(1, Math.round(cell.note - transpose)));
    }
    song[OFF.phraseNotes + phrase * PHRASE_LENGTH + step] = note;
    const instr = cell.note !== null && !cell.cut ? instrumentIndex(cell.instrumentId) : NO_INSTRUMENT;
    song[OFF.phraseInstruments + phrase * PHRASE_LENGTH + step] = instr & 0xff;
    const { cmd, value } = stepCommand(cell);
    song[OFF.phraseCommands + phrase * PHRASE_LENGTH + step] = cmd;
    song[OFF.phraseCommandValues + phrase * PHRASE_LENGTH + step] = value;
  }
  if (touchAlloc) {
    setBit(song.subarray(OFF.phraseAlloc, OFF.phraseAlloc + 32), phrase);
  }
}

function writeChain(song: Uint8Array, chain: number, phrases: number[]): void {
  for (let step = 0; step < CHAIN_LENGTH; step += 1) {
    const phrase = phrases[step] ?? NO_PHRASE;
    song[OFF.chainPhrases + chain * CHAIN_LENGTH + step] = phrase;
    song[OFF.chainTransposes + chain * CHAIN_LENGTH + step] = 0;
  }
  setBit(song.subarray(OFF.chainAlloc, OFF.chainAlloc + 16), chain);
}

function setTempo(song: Uint8Array, bpm: number): void {
  const clamped = Math.min(295, Math.max(40, Math.round(bpm)));
  song[OFF.tempo] = clamped > 255 ? clamped - 256 : clamped;
}

function buildFileMemory(): Uint8Array {
  const file = new Uint8Array(LSDJ_SAV_SIZE - SONG_SIZE);
  // Header block at start of file memory.
  let o = 0;
  // project names (empty)
  o += PROJECT_COUNT * PROJECT_NAME_LENGTH;
  // versions
  o += PROJECT_COUNT;
  // reserved empty
  o += 30;
  file[o] = 0x6a; // 'j'
  file[o + 1] = 0x6b; // 'k'
  o += 2;
  file[o] = 0xff; // no active project
  o += 1;
  file.fill(0xff, o, o + BLOCK_COUNT); // empty block alloc
  return file;
}

function instrumentIndexLookup(instruments: Instrument[]): (id: string | null) => number {
  const instrumentIds = new Map<string, number>();
  instruments.forEach((instrument, index) => {
    const match = /^ins-(\d+)$/.exec(instrument.id);
    if (match) {
      instrumentIds.set(instrument.id, Number(match[1]) - 1);
    } else {
      instrumentIds.set(instrument.id, index);
    }
  });
  return (id: string | null): number => {
    if (!id) {
      return instruments.length > 0 ? (instrumentIds.get(instruments[0].id) ?? 0) : NO_INSTRUMENT;
    }
    return instrumentIds.get(id) ?? 0;
  };
}

function encodeGreenfield(song: Song): Uint8Array {
  const songBytes = createEmptyLsdjSong();
  setTempo(songBytes, song.tempo);
  writeWaveforms(songBytes);

  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  instruments.forEach((instrument, index) => {
    writeInstrument(songBytes, index, instrument);
  });
  const instrumentIndex = instrumentIndexLookup(instruments);

  const channelCount = 4;
  let nextPhrase = 0;
  let nextChain = 0;
  const channelChains: number[][] = [[], [], [], []];

  for (let channel = 0; channel < channelCount; channel += 1) {
    const phraseList: number[] = [];
    for (const patternId of song.order) {
      const pattern = song.patterns.find((item) => item.id === patternId);
      if (!pattern) {
        continue;
      }
      if (nextPhrase >= MAX_PHRASES) {
        throw new Error(`Song is too large for LSDJ (more than ${MAX_PHRASES} phrases).`);
      }
      const cells: Cell[] = pattern.rows.map((row) => row[channel] ?? {
        note: null, cut: false, instrumentId: null, volume: null, effect: null,
      });
      writePhrase(songBytes, nextPhrase, cells, instrumentIndex);
      phraseList.push(nextPhrase);
      nextPhrase += 1;
    }
    for (let i = 0; i < phraseList.length; i += CHAIN_LENGTH) {
      if (nextChain >= MAX_CHAINS) {
        throw new Error(`Song is too large for LSDJ (more than ${MAX_CHAINS} chains).`);
      }
      const chunk = phraseList.slice(i, i + CHAIN_LENGTH);
      writeChain(songBytes, nextChain, chunk);
      channelChains[channel].push(nextChain);
      nextChain += 1;
    }
  }

  const sequenceRows = Math.max(
    channelChains[0].length,
    channelChains[1].length,
    channelChains[2].length,
    channelChains[3].length,
  );
  if (sequenceRows > MAX_SEQUENCE_ROWS) {
    throw new Error('Song is too large for LSDJ (sequence longer than 256).');
  }
  for (let row = 0; row < MAX_SEQUENCE_ROWS; row += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const chain = channelChains[channel][row];
      songBytes[OFF.sequence + row * channelCount + channel] =
        chain === undefined ? NO_CHAIN : chain;
    }
  }

  songBytes[OFF.rb1] = 0x72;
  songBytes[OFF.rb1 + 1] = 0x62;
  songBytes[OFF.rb2] = 0x72;
  songBytes[OFF.rb2 + 1] = 0x62;
  songBytes[OFF.rb3] = 0x72;
  songBytes[OFF.rb3 + 1] = 0x62;

  const sav = new Uint8Array(LSDJ_SAV_SIZE);
  sav.set(songBytes, 0);
  sav.set(buildFileMemory(), SONG_SIZE);
  return sav;
}

function encodePatchInPlace(
  song: Song,
  baseSav: Uint8Array,
  importMap: LsdjImportMap,
): Uint8Array {
  if (baseSav.length !== LSDJ_SAV_SIZE) {
    throw new Error(`LSDJ base .sav must be ${LSDJ_SAV_SIZE} bytes (got ${baseSav.length}).`);
  }
  const sav = new Uint8Array(baseSav);
  const songBytes = sav.subarray(0, SONG_SIZE);
  if (readTempo(songBytes) !== Math.min(295, Math.max(40, Math.round(song.tempo)))) {
    setTempo(songBytes, song.tempo);
  }

  mergeEditableInstruments(songBytes, song.instruments, importMap.editableInstruments);

  const instrumentIndex = instrumentIndexLookup(song.instruments);

  const orderLen = song.order.length;
  for (let channel = 0; channel < 4; channel += 1) {
    const refs = importMap.channelPhrases[channel] ?? [];
    const limit = Math.min(orderLen, refs.length);
    for (let orderIndex = 0; orderIndex < limit; orderIndex += 1) {
      const ref = refs[orderIndex];
      if (!ref) {
        continue;
      }
      const patternId = song.order[orderIndex];
      const pattern = song.patterns.find((item) => item.id === patternId);
      if (!pattern) {
        continue;
      }
      const cells: Cell[] = pattern.rows.map((row) => row[channel] ?? {
        note: null, cut: false, instrumentId: null, volume: null, effect: null,
      });
      writePhrase(songBytes, ref.phrase, cells, instrumentIndex, ref.transpose, false);
    }
  }

  return sav;
}

/**
 * Map a Chippy Game Boy song into an LSDJ-compatible 128 KiB .sav.
 * With baseSav + importMap, patches in place so unsupported structure is preserved.
 * With baseSav and modified === false, returns a byte-identical clone (identity invariant).
 */
export function encodeLsdjSav(song: Song, options?: LsdjEncodeOptions): Uint8Array {
  if (song.chip !== 'gameboy') {
    throw new Error('LSDJ SAV export is for the Game Boy.');
  }
  const baseSav = options?.baseSav ?? null;
  const importMap = options?.importMap ?? null;
  if (baseSav) {
    if (options?.modified === false) {
      if (baseSav.length !== LSDJ_SAV_SIZE) {
        throw new Error(`LSDJ base .sav must be ${LSDJ_SAV_SIZE} bytes (got ${baseSav.length}).`);
      }
      return new Uint8Array(baseSav);
    }
    if (!importMap) {
      throw new Error('LSDJ patch-in-place export requires the import map from decode.');
    }
    return encodePatchInPlace(song, baseSav, importMap);
  }
  return encodeGreenfield(song);
}

/**
 * Honesty status for `.sav` export until full LSDJ compatibility ships.
 */
export function lsdjSavCompatibilityStatus(options?: {
  baseSav?: Uint8Array | null;
  structurePreserved?: boolean;
}): string {
  const hasBase = Boolean(options?.baseSav && options.baseSav.length === LSDJ_SAV_SIZE);
  const preserved = options?.structurePreserved !== false && hasBase;
  const works =
    'Works now: phrase notes/FX Chippy knows, pulse/wave/noise instrument panel fields, tempo, .sav open/export.';
  const mode = hasBase
    ? preserved
      ? 'Round-trip: chain layout, tables, grooves, kits, speech, wave bank, and file slots from the opened .sav are preserved on re-export. Pulse/wave/noise panel edits merge into original instrument slots without wiping table/kit bits. Chippy still edits a flattened Song Order view.'
      : 'Round-trip: opened .sav base is kept, but Song Order no longer fully aligns with the import map — chain slots that still map were patched; unmapped Chippy-only rows were not written into the hierarchy. Instrument panel merges still apply to mapped pulse/wave/noise slots.'
    : 'Greenfield: new export builds synthetic chains from Song Order; no tables, grooves, kits, speech, or file slots.';
  const missing =
    'Still missing for full editability: Chains UI, Tables (A), Grooves (G), Synth/wave editor (F), Kits, Speech, File slots /.lsdsng, and engine preview gaps for deferred cmds.';
  return `${works} ${mode} ${missing}`;
}

function readName(source: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && source[end] !== 0) {
    end += 1;
  }
  const raw = new TextDecoder().decode(source.subarray(offset, end)).trim();
  return raw.replace(/[^\x20-\x7E]/g, '') || 'INST';
}

function signedByte(value: number): number {
  return value > 127 ? value - 256 : value;
}

function readTempo(song: Uint8Array): number {
  const raw = song[OFF.tempo];
  const bpm = raw < 40 ? raw + 256 : raw;
  return Math.min(295, Math.max(40, bpm));
}

function readPulseFields(bytes: Uint8Array): Partial<Instrument> {
  const env = bytes[1];
  const sweep = bytes[4];
  const duty = ((bytes[7] >> 6) & 3) as 0 | 1 | 2 | 3;
  return {
    kind: 'pulse',
    envelopeStart: (env >> 4) & 0x0f,
    envelopeDown: ((env >> 3) & 1) === 0,
    envelopePeriod: env & 0x07,
    sweepTime: sweep === 0xff ? 0 : (sweep >> 4) & 7,
    sweepDown: sweep === 0xff ? true : ((sweep >> 3) & 1) === 1,
    sweepShift: sweep === 0xff ? 0 : sweep & 7,
    duty,
  };
}

function readWaveFields(bytes: Uint8Array): Partial<Instrument> {
  const waveVol = (bytes[1] >> 5) & 3;
  const envelopeStart = waveVol === 3 ? 15 : waveVol === 2 ? 10 : waveVol === 1 ? 5 : 0;
  return {
    kind: 'wave',
    envelopeStart,
    envelopeDown: false,
    envelopePeriod: 0,
    waveform: bytes[3] & 0x0f,
  };
}

function readNoiseFields(bytes: Uint8Array): Partial<Instrument> {
  const env = bytes[1];
  return {
    kind: 'noise',
    envelopeStart: (env >> 4) & 0x0f,
    envelopeDown: ((env >> 3) & 1) === 0,
    envelopePeriod: env & 0x07,
    noiseShort: bytes[2] !== 0,
  };
}

interface InstrumentReadResult {
  instruments: Instrument[];
  editableInstruments: number[];
}

function readInstruments(song: Uint8Array, warnings: string[]): InstrumentReadResult {
  const instruments: Instrument[] = [];
  const editableInstruments: number[] = [];
  let sawKit = false;
  let sawTable = false;
  for (let index = 0; index < MAX_INSTRUMENTS; index += 1) {
    if (song[OFF.instrAlloc + index] !== 1) {
      continue;
    }
    const bytes = song.subarray(OFF.instruments + index * 16, OFF.instruments + index * 16 + 16);
    const name = readName(song, OFF.instrumentNames + index * 5, 5);
    const type = bytes[0];
    if ((bytes[6] & 0x20) !== 0) {
      sawTable = true;
    }
    let kind: InstrumentKind = 'pulse';
    let fields: Partial<Instrument> = {};
    if (type === 1) {
      kind = 'wave';
      fields = readWaveFields(bytes);
      editableInstruments.push(index);
    } else if (type === 3) {
      kind = 'noise';
      fields = readNoiseFields(bytes);
      editableInstruments.push(index);
    } else if (type === 2) {
      sawKit = true;
      kind = 'pulse';
      fields = { ...readPulseFields(bytes), kind: 'pulse' };
    } else if (type === 0) {
      fields = readPulseFields(bytes);
      editableInstruments.push(index);
    } else {
      warnings.push(`Instrument ${index} has unsupported type ${type}; imported as pulse.`);
      fields = readPulseFields(bytes);
    }
    instruments.push(
      baseInstrument({
        id: `ins-${index + 1}`,
        name: name.slice(0, 40),
        kind,
        ...fields,
      }),
    );
  }
  if (sawKit) {
    warnings.push('Kit instruments are not in Chippy yet; kit slots were imported as pulse.');
  }
  if (sawTable) {
    warnings.push('Tables are not in Chippy yet; table links on instruments were ignored.');
  }
  if (instruments.length === 0) {
    instruments.push(baseInstrument({ id: 'ins-1', name: 'Pulse', kind: 'pulse' }));
  }
  return { instruments, editableInstruments };
}

function instrumentIdForIndex(instruments: Instrument[], index: number): string | null {
  if (index === NO_INSTRUMENT) {
    return null;
  }
  const match = instruments.find((item) => item.id === `ins-${index + 1}`);
  return match?.id ?? instruments[0]?.id ?? null;
}

function readPhraseCells(
  song: Uint8Array,
  phrase: number,
  transpose: number,
  instruments: Instrument[],
  unknownCmds: Set<number>,
): Cell[] {
  const cells: Cell[] = [];
  for (let step = 0; step < PHRASE_LENGTH; step += 1) {
    const noteRaw = song[OFF.phraseNotes + phrase * PHRASE_LENGTH + step];
    const instrRaw = song[OFF.phraseInstruments + phrase * PHRASE_LENGTH + step];
    const cmdByte = song[OFF.phraseCommands + phrase * PHRASE_LENGTH + step];
    const value = song[OFF.phraseCommandValues + phrase * PHRASE_LENGTH + step];
    const cmd = cmdByte === 0 ? null : LSDJ_BYTE_TO_CMD[cmdByte] ?? null;
    if (cmdByte !== 0 && !cmd) {
      unknownCmds.add(cmdByte);
    }
    const cut = cmd === 'K' && noteRaw === NO_NOTE;
    let note: number | null = null;
    if (!cut && noteRaw !== NO_NOTE) {
      note = Math.min(127, Math.max(1, noteRaw + transpose));
    }
    let effect: Cell['effect'] = null;
    if (cmd && !cut) {
      effect = { cmd, value: value & 0xff };
    }
    cells.push({
      note,
      cut,
      instrumentId: note !== null ? instrumentIdForIndex(instruments, instrRaw) : null,
      volume: null,
      effect,
    });
  }
  return cells;
}

function expandChannelPhrases(song: Uint8Array, channel: number): LsdjPhraseRef[] {
  const list: LsdjPhraseRef[] = [];
  for (let row = 0; row < MAX_SEQUENCE_ROWS; row += 1) {
    const chain = song[OFF.sequence + row * 4 + channel];
    if (chain === NO_CHAIN) {
      break;
    }
    if (chain >= MAX_CHAINS) {
      continue;
    }
    for (let step = 0; step < CHAIN_LENGTH; step += 1) {
      const phrase = song[OFF.chainPhrases + chain * CHAIN_LENGTH + step];
      if (phrase === NO_PHRASE) {
        break;
      }
      if (phrase >= MAX_PHRASES) {
        continue;
      }
      list.push({
        phrase,
        transpose: signedByte(song[OFF.chainTransposes + chain * CHAIN_LENGTH + step]),
      });
    }
  }
  return list;
}

function groovesAreDefault(song: Uint8Array): boolean {
  if (song[OFF.grooves] !== 6 || song[OFF.grooves + 1] !== 6) {
    return false;
  }
  for (let i = 2; i < 16 * 16; i += 1) {
    if (song[OFF.grooves + i] !== 0) {
      return false;
    }
  }
  return true;
}

function fileSlotsLookUsed(sav: Uint8Array): boolean {
  if (sav.length < LSDJ_SAV_SIZE) {
    return false;
  }
  const file = sav.subarray(SONG_SIZE);
  for (let project = 0; project < PROJECT_COUNT; project += 1) {
    const base = project * PROJECT_NAME_LENGTH;
    for (let i = 0; i < PROJECT_NAME_LENGTH; i += 1) {
      if (file[base + i] !== 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Flatten an LSDJ 128 KiB `.sav` work song into Chippy's Game Boy Song
 * (chains → unique patterns in Song Order). Unsupported structures become warnings.
 * Returns an importMap so re-export can patch phrase slots in place.
 */
export function decodeLsdjSav(bytes: Uint8Array): LsdjDecodeResult {
  if (bytes.length !== LSDJ_SAV_SIZE) {
    throw new Error(`LSDJ .sav must be ${LSDJ_SAV_SIZE} bytes (got ${bytes.length}).`);
  }
  const songBytes = bytes.subarray(0, SONG_SIZE);
  const warnings: string[] = [];
  const formatVersion = songBytes[OFF.formatVersion];

  if (
    songBytes[OFF.rb1] !== 0x72 || songBytes[OFF.rb1 + 1] !== 0x62
    || songBytes[OFF.rb2] !== 0x72 || songBytes[OFF.rb2 + 1] !== 0x62
    || songBytes[OFF.rb3] !== 0x72 || songBytes[OFF.rb3 + 1] !== 0x62
  ) {
    warnings.push('Work-song init markers look unusual; import may be incomplete.');
  }
  if (formatVersion < LSDJ_FORMAT_VERSION_MIN || formatVersion > LSDJ_FORMAT_VERSION_MAX) {
    warnings.push(
      `Song format version ${formatVersion} is outside Chippy's known band `
      + `(${LSDJ_FORMAT_VERSION_MIN}–${LSDJ_FORMAT_VERSION_MAX}); import may be incomplete.`,
    );
  } else if (formatVersion !== LSDJ_GREENFIELD_FORMAT_VERSION) {
    warnings.push(
      `Song format version ${formatVersion} (Chippy greenfield exports use ${LSDJ_GREENFIELD_FORMAT_VERSION}). `
      + 'Re-export preserves the opened format version.',
    );
  }

  const { instruments, editableInstruments } = readInstruments(songBytes, warnings);
  if (!groovesAreDefault(songBytes)) {
    warnings.push('Grooves are not in Chippy yet; non-default grooves were ignored for editing (preserved on re-export).');
  }
  if (fileSlotsLookUsed(bytes)) {
    warnings.push('File slots / .lsdsng projects in the upper 96KB are not editable in Chippy yet (preserved on re-export).');
  }

  const channelPhrases = [0, 1, 2, 3].map((channel) => expandChannelPhrases(songBytes, channel));
  const orderLength = Math.max(1, ...channelPhrases.map((list) => list.length));
  const seenPhrases = new Set<number>();
  let sharedPhrase = false;
  let nonZeroTranspose = false;
  const unknownCmds = new Set<number>();

  const patterns: Pattern[] = [];
  const order: string[] = [];
  for (let index = 0; index < orderLength; index += 1) {
    const id = `pat-${index + 1}`;
    const pattern: Pattern = {
      id,
      name: `Pattern ${index + 1}`,
      rows: Array.from({ length: PATTERN_ROWS }, () => Array.from({ length: 4 }, () => emptyCell())),
    };
    for (let channel = 0; channel < 4; channel += 1) {
      const ref = channelPhrases[channel][index];
      if (!ref) {
        continue;
      }
      if (seenPhrases.has(ref.phrase)) {
        sharedPhrase = true;
      }
      seenPhrases.add(ref.phrase);
      if (ref.transpose !== 0) {
        nonZeroTranspose = true;
      }
      const cells = readPhraseCells(
        songBytes,
        ref.phrase,
        ref.transpose,
        instruments,
        unknownCmds,
      );
      for (let row = 0; row < PHRASE_LENGTH; row += 1) {
        pattern.rows[row][channel] = cells[row] ?? emptyCell();
      }
    }
    patterns.push(pattern);
    order.push(id);
  }

  if (sharedPhrase) {
    warnings.push(
      'Shared phrases were expanded into unique patterns for editing; re-export patches the shared phrase slot (last mapped pattern wins).',
    );
  }
  if (nonZeroTranspose) {
    warnings.push(
      'Chain transpose was baked into notes for editing; re-export restores transpose via patch-in-place.',
    );
  }
  if (unknownCmds.size > 0) {
    warnings.push(
      `Unknown phrase command byte(s) skipped: ${[...unknownCmds].map((b) => b.toString(16).padStart(2, '0')).join(', ')}.`,
    );
  }
  warnings.push('Tables, kits, speech, and softsynth details are not editable in Chippy yet (preserved on re-export).');

  const uniqueWarnings = [...new Set(warnings)];

  const song: Song = {
    name: 'LSDJ Import',
    chip: 'gameboy',
    tempo: readTempo(songBytes),
    order,
    patterns,
    instruments,
    armedInstrumentId: instruments[0].id,
  };
  return {
    song,
    warnings: uniqueWarnings,
    formatVersion,
    importMap: { channelPhrases, editableInstruments },
  };
}

/** Wrap a decoded LSDJ song into a Chippy Project for session.load. */
export function projectFromLsdjDecode(result: LsdjDecodeResult, projectName = 'LSDJ Import'): Project {
  const body = {
    id: 'song-1',
    name: result.song.name,
    tempo: result.song.tempo,
    order: result.song.order,
    patterns: result.song.patterns,
  };
  return {
    version: PROJECT_VERSION,
    name: projectName,
    chip: 'gameboy',
    instruments: result.song.instruments,
    armedInstrumentId: result.song.armedInstrumentId,
    songs: [body],
    activeSongId: body.id,
    customPresets: [],
  };
}

/** True when Song Order length still aligns with the import map on every channel. */
export function lsdjImportMapAligned(song: Song, importMap: LsdjImportMap | null | undefined): boolean {
  if (!importMap) {
    return false;
  }
  const orderLen = song.order.length;
  return importMap.channelPhrases.every((refs) => refs.length === orderLen);
}
