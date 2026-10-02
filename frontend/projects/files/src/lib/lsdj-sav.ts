import type { Cell, EffectCmd, Instrument, Song } from '@chippy/domain';
import { WAVEFORMS } from '@chippy/engines';
import { createEmptyLsdjSong } from './lsdj-empty-song';

/** Full LSDJ .sav size (128 KiB). */
export const LSDJ_SAV_SIZE = 0x20000;
const SONG_SIZE = 0x8000;
const BLOCK_SIZE = 0x200;
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

function writePulseInstrument(dest: Uint8Array, instrument: Instrument): void {
  dest.fill(0);
  dest[0] = 0; // pulse
  dest[1] = envelopeByte(instrument);
  dest[2] = 0;
  dest[3] = 0; // unlimited length
  const sweepTime = instrument.sweepTime & 7;
  const sweepShift = instrument.sweepShift & 7;
  const sweepNeg = instrument.sweepDown ? 1 : 0;
  dest[4] = sweepTime === 0 && sweepShift === 0
    ? 0xff
    : ((sweepTime & 7) << 4) | (sweepNeg << 3) | (sweepShift & 7);
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
  const vol = Math.min(15, Math.max(0, instrument.envelopeStart | 0));
  // Wave volume: 0%, 25%, 50%, 100% encoded in bits 6-5 roughly as E values.
  const waveVol = vol >= 12 ? 0x60 : vol >= 6 ? 0x40 : vol > 0 ? 0x20 : 0x00;
  dest[1] = waveVol;
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
): void {
  for (let step = 0; step < PHRASE_LENGTH; step += 1) {
    const cell = cells[step] ?? { note: null, cut: false, instrumentId: null, volume: null, effect: null };
    const note = cell.cut || cell.note === null ? NO_NOTE : Math.min(127, Math.max(1, Math.round(cell.note)));
    song[OFF.phraseNotes + phrase * PHRASE_LENGTH + step] = note;
    const instr = cell.note !== null && !cell.cut ? instrumentIndex(cell.instrumentId) : NO_INSTRUMENT;
    song[OFF.phraseInstruments + phrase * PHRASE_LENGTH + step] = instr & 0xff;
    const { cmd, value } = stepCommand(cell);
    song[OFF.phraseCommands + phrase * PHRASE_LENGTH + step] = cmd;
    song[OFF.phraseCommandValues + phrase * PHRASE_LENGTH + step] = value;
  }
  setBit(song.subarray(OFF.phraseAlloc, OFF.phraseAlloc + 32), phrase);
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

/**
 * Map a Chippy Game Boy song into an LSDJ-compatible 128 KiB .sav
 * (work memory + empty file slots).
 */
export function encodeLsdjSav(song: Song): Uint8Array {
  if (song.chip !== 'gameboy') {
    throw new Error('LSDJ SAV export is for the Game Boy.');
  }
  const songBytes = createEmptyLsdjSong();
  setTempo(songBytes, song.tempo);
  writeWaveforms(songBytes);

  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  const instrumentIds = new Map<string, number>();
  instruments.forEach((instrument, index) => {
    instrumentIds.set(instrument.id, index);
    writeInstrument(songBytes, index, instrument);
  });
  const instrumentIndex = (id: string | null): number => {
    if (!id) {
      return instruments.length > 0 ? 0 : NO_INSTRUMENT;
    }
    return instrumentIds.get(id) ?? 0;
  };

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
    // Chunk phrases into chains of 16.
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

  // Ensure init markers remain intact.
  songBytes[OFF.rb1] = 0x72; // 'r'
  songBytes[OFF.rb1 + 1] = 0x62; // 'b'
  songBytes[OFF.rb2] = 0x72;
  songBytes[OFF.rb2 + 1] = 0x62;
  songBytes[OFF.rb3] = 0x72;
  songBytes[OFF.rb3 + 1] = 0x62;

  const sav = new Uint8Array(LSDJ_SAV_SIZE);
  sav.set(songBytes, 0);
  sav.set(buildFileMemory(), SONG_SIZE);
  return sav;
}
