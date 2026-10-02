import {
  baseInstrument,
  blankLsdjChain,
  blankLsdjPhrase,
  blankLsdjTable,
  blankTableStep,
  defaultGrooves,
  emptySequence,
  PROJECT_VERSION,
  syncFlatProjection,
  toTransposeByte,
  type Cell,
  type EffectCmd,
  type Instrument,
  type InstrumentKind,
  type LsdjChain,
  type LsdjChainStep,
  type LsdjHierarchy,
  type LsdjImportMap,
  type LsdjPhrase,
  type LsdjPhraseRef,
  type LsdjTable,
  type LsdjTableStep,
  type Project,
  type Song,
  type SongBody,
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
const MAX_TABLES = 32;
const MAX_GROOVES = 31;
const GROOVE_LENGTH = 16;
const TABLE_LENGTH = 16;

const OFF = {
  phraseNotes: 0x0000,
  grooves: 0x1090,
  sequence: 0x1290,
  tableEnvelopes: 0x1690,
  rb1: 0x1e78,
  instrumentNames: 0x1e7a,
  tableAlloc: 0x2020,
  instrAlloc: 0x2040,
  chainPhrases: 0x2080,
  chainTransposes: 0x2880,
  instruments: 0x3080,
  tableTransposition: 0x3480,
  tableCommand1: 0x3680,
  tableCommand1Value: 0x3880,
  tableCommand2: 0x3a80,
  tableCommand2Value: 0x3c80,
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
  /** LSDJ hierarchy when present (phrases/chains/tables/grooves). */
  hierarchy?: LsdjHierarchy | null;
}

/** Result of opening an LSDJ `.sav` into Chippy (flat Song + LSDJ hierarchy). */
export interface LsdjDecodeResult {
  song: Song;
  hierarchy: LsdjHierarchy;
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

function writeChain(
  song: Uint8Array,
  chain: number,
  steps: Array<{ phrase: number; transpose?: number } | null>,
): void {
  for (let step = 0; step < CHAIN_LENGTH; step += 1) {
    const entry = steps[step];
    const phrase = entry?.phrase ?? NO_PHRASE;
    song[OFF.chainPhrases + chain * CHAIN_LENGTH + step] = phrase;
    song[OFF.chainTransposes + chain * CHAIN_LENGTH + step] = entry
      ? toTransposeByte(entry.transpose ?? 0)
      : 0;
  }
  setBit(song.subarray(OFF.chainAlloc, OFF.chainAlloc + 16), chain);
}

/**
 * Write phrases, chains, and the sequence at their own LSDJ slot indices.
 * The hierarchy carries real slot numbers, so greenfield and patch-in-place share this path.
 */
function writeHierarchy(
  song: Uint8Array,
  hierarchy: LsdjHierarchy,
  instrumentIndex: (id: string | null) => number,
): void {
  for (const phrase of hierarchy.phrases) {
    if (phrase.index < 0 || phrase.index >= MAX_PHRASES) {
      continue;
    }
    writePhrase(song, phrase.index, phrase.steps, instrumentIndex);
  }
  for (const chain of hierarchy.chains) {
    if (chain.index < 0 || chain.index >= MAX_CHAINS) {
      continue;
    }
    writeChain(
      song,
      chain.index,
      chain.steps.map((step) =>
        step.phrase === null ? null : { phrase: step.phrase, transpose: step.transpose },
      ),
    );
  }
  for (let row = 0; row < MAX_SEQUENCE_ROWS; row += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      const chain = hierarchy.sequence[channel]?.[row];
      song[OFF.sequence + row * 4 + channel] =
        chain === null || chain === undefined || chain >= MAX_CHAINS ? NO_CHAIN : chain;
    }
  }
}

function writeGrooves(song: Uint8Array, grooves: number[][]): void {
  for (let g = 0; g < MAX_GROOVES; g += 1) {
    const steps = grooves[g] ?? [];
    for (let step = 0; step < GROOVE_LENGTH; step += 1) {
      song[OFF.grooves + g * GROOVE_LENGTH + step] = (steps[step] ?? 0) & 0xff;
    }
  }
}

function readGrooves(song: Uint8Array): number[][] {
  const grooves = defaultGrooves();
  for (let g = 0; g < MAX_GROOVES; g += 1) {
    for (let step = 0; step < GROOVE_LENGTH; step += 1) {
      grooves[g][step] = song[OFF.grooves + g * GROOVE_LENGTH + step] & 0xff;
    }
  }
  return grooves;
}

function commandByteToCmd(byte: number, formatVersion: number): EffectCmd | null {
  let mapped = byte;
  if (formatVersion >= 8) {
    if (byte === 1) {
      return 'B';
    }
    if (byte > 1) {
      mapped = byte - 1;
    }
  }
  return LSDJ_BYTE_TO_CMD[mapped] ?? null;
}

function cmdToTableByte(cmd: EffectCmd | null, formatVersion: number): number {
  if (!cmd) {
    return 0;
  }
  const base = commandByte(cmd);
  if (formatVersion >= 8) {
    if (cmd === 'B') {
      return 1;
    }
    if (base > 1) {
      return base + 1;
    }
  }
  return base;
}

function readTables(song: Uint8Array, formatVersion: number): LsdjTable[] {
  const tables: LsdjTable[] = [];
  for (let index = 0; index < MAX_TABLES; index += 1) {
    if (song[OFF.tableAlloc + index] !== 1) {
      continue;
    }
    const steps: LsdjTableStep[] = [];
    for (let step = 0; step < TABLE_LENGTH; step += 1) {
      const offset = index * TABLE_LENGTH + step;
      steps.push({
        envelope: song[OFF.tableEnvelopes + offset] & 0xff,
        transpose: song[OFF.tableTransposition + offset] & 0xff,
        cmd1: commandByteToCmd(song[OFF.tableCommand1 + offset], formatVersion),
        cmd1Value: song[OFF.tableCommand1Value + offset] & 0xff,
        cmd2: commandByteToCmd(song[OFF.tableCommand2 + offset], formatVersion),
        cmd2Value: song[OFF.tableCommand2Value + offset] & 0xff,
      });
    }
    tables.push({ index, steps });
  }
  if (tables.length === 0) {
    tables.push(blankLsdjTable(0));
  }
  return tables;
}

/**
 * Write tables at their own slot indices. When patching an opened `.sav`, only slots that
 * were already allocated are touched so LSDJ's allocation table is left intact.
 */
function writeTables(
  song: Uint8Array,
  tables: LsdjTable[],
  formatVersion: number,
  allocatedTables?: number[],
): void {
  const patchMode = allocatedTables !== undefined;
  const allowed = patchMode ? new Set(allocatedTables) : null;
  if (!patchMode) {
    song.fill(0, OFF.tableAlloc, OFF.tableAlloc + MAX_TABLES);
  }
  for (const table of tables) {
    const slot = table.index;
    if (slot < 0 || slot >= MAX_TABLES) {
      continue;
    }
    if (allowed && !allowed.has(slot)) {
      continue;
    }
    song[OFF.tableAlloc + slot] = 1;
    for (let step = 0; step < TABLE_LENGTH; step += 1) {
      const row = table.steps[step] ?? blankTableStep();
      const offset = slot * TABLE_LENGTH + step;
      song[OFF.tableEnvelopes + offset] = row.envelope & 0xff;
      song[OFF.tableTransposition + offset] = row.transpose & 0xff;
      song[OFF.tableCommand1 + offset] = cmdToTableByte(row.cmd1, formatVersion);
      song[OFF.tableCommand1Value + offset] = row.cmd1Value & 0xff;
      song[OFF.tableCommand2 + offset] = cmdToTableByte(row.cmd2, formatVersion);
      song[OFF.tableCommand2Value + offset] = row.cmd2Value & 0xff;
    }
  }
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

function encodeHierarchyGreenfield(song: Song, hierarchy: LsdjHierarchy): Uint8Array {
  const songBytes = createEmptyLsdjSong();
  setTempo(songBytes, song.tempo);
  writeWaveforms(songBytes);
  writeGrooves(songBytes, hierarchy.grooves);

  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  instruments.forEach((instrument, index) => {
    writeInstrument(songBytes, index, instrument);
  });
  const instrumentIndex = instrumentIndexLookup(instruments);
  const formatVersion = songBytes[OFF.formatVersion] ?? LSDJ_GREENFIELD_FORMAT_VERSION;

  writeHierarchy(songBytes, hierarchy, instrumentIndex);
  writeTables(songBytes, hierarchy.tables, formatVersion);

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

function encodeGreenfield(song: Song, hierarchy?: LsdjHierarchy | null): Uint8Array {
  if (hierarchy?.enabled) {
    return encodeHierarchyGreenfield(song, hierarchy);
  }
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
      writeChain(
        songBytes,
        nextChain,
        chunk.map((phrase) => ({ phrase, transpose: 0 })),
      );
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
  hierarchy?: LsdjHierarchy | null,
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
  const formatVersion = songBytes[OFF.formatVersion];

  // Without a hierarchy there is no structure to patch, so instruments and tempo are all
  // that change and the rest of the opened file is left exactly as it was.
  if (hierarchy) {
    writeGrooves(songBytes, hierarchy.grooves);
    writeTables(songBytes, hierarchy.tables, formatVersion, importMap.allocatedTables);
    writeHierarchy(songBytes, hierarchy, instrumentIndex);
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
  const hierarchy = options?.hierarchy ?? null;
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
    return encodePatchInPlace(song, baseSav, importMap, hierarchy);
  }
  return encodeGreenfield(song, hierarchy);
}

/**
 * Honesty status for `.sav` export until full LSDJ compatibility ships.
 */
export function lsdjSavCompatibilityStatus(options?: {
  baseSav?: Uint8Array | null;
  structurePreserved?: boolean;
  lsdjMode?: boolean;
}): string {
  const hasBase = Boolean(options?.baseSav && options.baseSav.length === LSDJ_SAV_SIZE);
  const preserved = options?.structurePreserved !== false && hasBase;
  const lsdjMode = Boolean(options?.lsdjMode);
  const works =
    'Works now: phrase notes/FX, the LSDJ hierarchy (sequence/chains/phrases/transpose), tables, grooves, pulse/wave/noise instrument panel fields, tempo, .sav open/export.';
  const mode = hasBase
    ? preserved
      ? 'Round-trip: patch-in-place writes phrases, chains, sequence, tables, and grooves back into their original slots in the opened .sav. Kits, speech, wave bank softsynth, and file slots stay preserved.'
      : 'Round-trip: opened .sav base is kept, but this song no longer carries an LSDJ hierarchy, so structure cannot be patched back.'
    : lsdjMode
      ? 'Greenfield: export writes the real chain hierarchy, tables, and grooves from LSDJ mode.'
      : 'Greenfield: new export builds synthetic chains from Song Order.';
  const missing =
    'Still missing for full editability: Synth/wave editor (F), Kits, Speech, File slots /.lsdsng, and some engine preview gaps.';
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
    warnings.push('Instrument table links were detected; edit tables in LSDJ mode (instrument panel).');
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
  for (let i = 2; i < MAX_GROOVES * GROOVE_LENGTH; i += 1) {
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

function bitIsSet(table: Uint8Array, index: number): boolean {
  return (table[index >> 3] & (1 << (index & 7))) !== 0;
}

/**
 * Decode an LSDJ 128 KiB `.sav` into Chippy Song + LSDJ hierarchy.
 * Phrases stay shared; transpose stays on chain steps (not baked into notes).
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
  if (fileSlotsLookUsed(bytes)) {
    warnings.push('File slots / .lsdsng projects in the upper 96KB are not editable in Chippy yet (preserved on re-export).');
  }

  const unknownCmds = new Set<number>();
  const phraseAlloc = songBytes.subarray(OFF.phraseAlloc, OFF.phraseAlloc + 32);
  const chainAlloc = songBytes.subarray(OFF.chainAlloc, OFF.chainAlloc + 16);

  const phrases: LsdjPhrase[] = [];
  const phraseSeen = new Set<number>();
  const ensurePhrase = (phraseIndex: number): void => {
    if (phraseIndex >= MAX_PHRASES || phraseSeen.has(phraseIndex)) {
      return;
    }
    phraseSeen.add(phraseIndex);
    phrases.push({
      index: phraseIndex,
      steps: readPhraseCells(songBytes, phraseIndex, 0, instruments, unknownCmds),
    });
  };

  const chains: LsdjChain[] = [];
  const chainSeen = new Set<number>();
  const ensureChain = (chainIndex: number): void => {
    if (chainIndex >= MAX_CHAINS || chainSeen.has(chainIndex)) {
      return;
    }
    chainSeen.add(chainIndex);
    const steps: LsdjChainStep[] = [];
    for (let step = 0; step < CHAIN_LENGTH; step += 1) {
      const phrase = songBytes[OFF.chainPhrases + chainIndex * CHAIN_LENGTH + step];
      if (phrase === NO_PHRASE || phrase >= MAX_PHRASES) {
        steps.push({ phrase: null, transpose: 0 });
        continue;
      }
      ensurePhrase(phrase);
      steps.push({
        phrase,
        transpose: signedByte(songBytes[OFF.chainTransposes + chainIndex * CHAIN_LENGTH + step]),
      });
    }
    chains.push({ index: chainIndex, steps });
  };

  for (let chainIndex = 0; chainIndex < MAX_CHAINS; chainIndex += 1) {
    if (bitIsSet(chainAlloc, chainIndex)) {
      ensureChain(chainIndex);
    }
  }
  for (let phraseIndex = 0; phraseIndex < MAX_PHRASES; phraseIndex += 1) {
    if (bitIsSet(phraseAlloc, phraseIndex)) {
      ensurePhrase(phraseIndex);
    }
  }

  const sequence: (number | null)[][] = emptySequence();
  for (let channel = 0; channel < 4; channel += 1) {
    for (let row = 0; row < MAX_SEQUENCE_ROWS; row += 1) {
      const chainIndex = songBytes[OFF.sequence + row * 4 + channel];
      if (chainIndex === NO_CHAIN || chainIndex >= MAX_CHAINS) {
        continue;
      }
      // The sequence may point at a chain LSDJ never marked allocated.
      ensureChain(chainIndex);
      sequence[channel][row] = chainIndex;
    }
  }

  phrases.sort((a, b) => a.index - b.index);
  chains.sort((a, b) => a.index - b.index);
  if (phrases.length === 0) {
    phrases.push(blankLsdjPhrase(0));
  }
  if (chains.length === 0) {
    chains.push(blankLsdjChain(0));
  }
  const sequenceIsEmpty = !sequence.some((rows) => rows.some((value) => value !== null));
  if (sequenceIsEmpty) {
    for (let channel = 0; channel < 4; channel += 1) {
      sequence[channel][0] = chains[0].index;
    }
  }

  const tables = readTables(songBytes, formatVersion);
  const allocatedTables = tables
    .map((table) => table.index)
    .filter((slot) => songBytes[OFF.tableAlloc + slot] === 1);

  const grooves = readGrooves(songBytes);
  if (!groovesAreDefault(songBytes)) {
    warnings.push('Non-default grooves imported (editable in LSDJ mode).');
  }

  if (unknownCmds.size > 0) {
    warnings.push(
      `Unknown phrase command byte(s) skipped: ${[...unknownCmds].map((b) => b.toString(16).padStart(2, '0')).join(', ')}.`,
    );
  }
  warnings.push('Kits, speech, and softsynth details are not editable in Chippy yet (preserved on re-export).');
  warnings.push('Opened in LSDJ mode — Song, Chain, and Phrase screens edit the real hierarchy.');

  const hierarchy: LsdjHierarchy = {
    enabled: true,
    phrases,
    chains,
    sequence,
    grooves,
    tables,
    activeGroove: 0,
    focus: { songRow: 0, chainStep: 0 },
  };

  const projected = syncFlatProjection({
    id: 'song-1',
    name: 'LSDJ Import',
    tempo: readTempo(songBytes),
    order: [],
    patterns: [],
    lsdj: hierarchy,
  });

  const uniqueWarnings = [...new Set(warnings)];
  const song: Song = {
    name: 'LSDJ Import',
    chip: 'gameboy',
    tempo: projected.tempo,
    order: projected.order,
    patterns: projected.patterns,
    instruments,
    armedInstrumentId: instruments[0]?.id ?? 'ins-1',
  };

  return {
    song,
    hierarchy: projected.lsdj!,
    warnings: uniqueWarnings,
    formatVersion,
    importMap: { editableInstruments, allocatedTables },
  };
}

/** Wrap a decoded LSDJ song into a Chippy Project for session.load (LSDJ mode on). */
export function projectFromLsdjDecode(result: LsdjDecodeResult, projectName = 'LSDJ Import'): Project {
  const body: SongBody = {
    id: 'song-1',
    name: result.song.name,
    tempo: result.song.tempo,
    order: result.song.order,
    patterns: result.song.patterns,
    lsdj: result.hierarchy,
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

/**
 * True when the opened `.sav` can still be patched in place.
 * The hierarchy carries its own LSDJ slot numbers, so structure is preserved as long as
 * the song still has one.
 */
export function lsdjImportMapAligned(
  importMap: LsdjImportMap | null | undefined,
  hierarchy: LsdjHierarchy | null | undefined,
): boolean {
  return Boolean(importMap && hierarchy);
}
