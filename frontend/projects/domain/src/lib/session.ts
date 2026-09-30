import { baseInstrument, chipDefinition } from './chips';
import { fillPatternRandom, randomSong } from './random-song';
import { blankPattern, emptyCell, newSong } from './song-factory';
import {
  PATTERN_ROWS,
  type Cell,
  type ChipId,
  type ColumnId,
  type Cursor,
  type Instrument,
  type Pattern,
  type Song,
} from './types';

const BLANK_PATTERN_NAME = /^Pattern (\d+)$/;
const DUPLICATE_SUFFIX = /^(.*) \((\d+)\)$/;

/** Next `"Pattern N"` name based on existing pattern names. */
export function nextBlankPatternName(song: Song): string {
  let max = 0;
  for (const pattern of song.patterns) {
    const match = BLANK_PATTERN_NAME.exec(pattern.name ?? '');
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `Pattern ${max + 1}`;
}

/** Strip a trailing ` (N)` duplicate suffix to get the copy base name. */
export function duplicateBaseName(name: string): string {
  const match = DUPLICATE_SUFFIX.exec(name);
  return match ? match[1] : name;
}

/** Next `"{base} (N)"` name for copies of a source pattern name. */
export function nextDuplicatePatternName(song: Song, sourceName: string): string {
  const base = duplicateBaseName(sourceName);
  let max = 0;
  for (const pattern of song.patterns) {
    const name = pattern.name ?? '';
    if (name === base) {
      continue;
    }
    const match = DUPLICATE_SUFFIX.exec(name);
    if (match && match[1] === base) {
      max = Math.max(max, Number(match[2]));
    }
  }
  return `${base} (${max + 1})`;
}

function nextPatternId(song: Song): string {
  let max = 0;
  for (const pattern of song.patterns) {
    const match = /^pat-(\d+)$/.exec(pattern.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `pat-${max + 1}`;
}

/** Display name when an older file omitted `pattern.name`. */
export function patternDisplayName(pattern: Pattern, fallbackIndex: number): string {
  if (pattern.name && pattern.name.trim()) {
    return pattern.name;
  }
  return `Pattern ${fallbackIndex + 1}`;
}

const COLUMNS: ColumnId[] = ['note', 'instrument', 'volume'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Lower keyboard row, tracker layout. Z is C. */
const LOWER_ROW = 'zsxdcvgbhnjm';
/** Upper keyboard row, one octave higher. Q is C. */
const UPPER_ROW = 'q2w3er5t6y7u';

export interface SessionState {
  song: Song;
  cursor: Cursor;
  octave: number;
  past: Song[];
  future: Song[];
}

export function formatNote(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}-${octave}`;
}

/**
 * Map a physical key to a MIDI note at the given octave.
 * Returns null when the key is not a piano key.
 */
export function noteFromKey(key: string, octave: number): number | null {
  const lower = LOWER_ROW.indexOf(key);
  if (lower >= 0) {
    return (octave + 1) * 12 + lower;
  }
  const upper = UPPER_ROW.indexOf(key);
  if (upper >= 0) {
    return (octave + 2) * 12 + upper;
  }
  return null;
}

/** The second confirm step accepts only this exact word. */
export function confirmationAccepted(typed: string): boolean {
  return typed === 'YES';
}

export function newSession(chip: ChipId = 'gameboy'): SessionState {
  return {
    song: newSong(chip),
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: 4,
    past: [],
    future: [],
  };
}

export function armedInstrument(song: Song): Instrument {
  return song.instruments.find((item) => item.id === song.armedInstrumentId) ?? song.instruments[0];
}

function cloneSong(song: Song): Song {
  return structuredClone(song);
}

function commit(state: SessionState, song: Song): SessionState {
  return {
    ...state,
    song,
    past: [...state.past, state.song].slice(-100),
    future: [],
  };
}

export function undo(state: SessionState): SessionState {
  const previous = state.past[state.past.length - 1];
  if (!previous) {
    return state;
  }
  return {
    ...state,
    song: previous,
    past: state.past.slice(0, -1),
    future: [state.song, ...state.future],
  };
}

export function redo(state: SessionState): SessionState {
  const next = state.future[0];
  if (!next) {
    return state;
  }
  return {
    ...state,
    song: next,
    past: [...state.past, state.song],
    future: state.future.slice(1),
  };
}

function currentPattern(song: Song, cursor: Cursor): Pattern {
  const id = song.order[cursor.orderIndex] ?? song.order[0];
  return song.patterns.find((pattern) => pattern.id === id) ?? song.patterns[0];
}

function writePattern(song: Song, pattern: Pattern): Song {
  return {
    ...song,
    patterns: song.patterns.map((item) => (item.id === pattern.id ? pattern : item)),
  };
}

function writeCell(state: SessionState, cell: Cell, advance: boolean): SessionState {
  const song = cloneSong(state.song);
  const pattern = currentPattern(song, state.cursor);
  const rows = pattern.rows.map((row) => row.map((item) => ({ ...item })));
  rows[state.cursor.row][state.cursor.channel] = cell;
  const nextSong = writePattern(song, { ...pattern, rows });
  const next = commit(state, nextSong);
  if (!advance) {
    return next;
  }
  const row = (state.cursor.row + 1) % PATTERN_ROWS;
  return { ...next, cursor: { ...state.cursor, row } };
}

/** Write a note with the armed instrument, play it, and move down one row. */
export function enterNote(state: SessionState, midi: number): SessionState {
  const instrument = armedInstrument(state.song);
  return writeCell(
    state,
    {
      note: midi,
      cut: false,
      instrumentId: instrument.id,
      volume: null,
    },
    true,
  );
}

export function enterCut(state: SessionState): SessionState {
  return writeCell(
    state,
    { note: null, cut: true, instrumentId: null, volume: null },
    true,
  );
}

export function clearCell(state: SessionState): SessionState {
  return writeCell(state, emptyCell(), false);
}

export function setVolume(state: SessionState, volume: number): SessionState {
  const pattern = currentPattern(state.song, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  return writeCell(state, { ...existing, volume }, true);
}

export function moveCursor(state: SessionState, deltaRow: number, deltaChannel: number, deltaColumn: number): SessionState {
  const channelCount = chipDefinition(state.song.chip).channels.length;
  let columnIndex = COLUMNS.indexOf(state.cursor.column) + deltaColumn;
  let channel = state.cursor.channel;
  if (columnIndex < 0) {
    columnIndex = COLUMNS.length - 1;
    channel -= 1;
  } else if (columnIndex >= COLUMNS.length) {
    columnIndex = 0;
    channel += 1;
  }
  channel = Math.min(channelCount - 1, Math.max(0, channel + deltaChannel));
  const row = Math.min(PATTERN_ROWS - 1, Math.max(0, state.cursor.row + deltaRow));
  return {
    ...state,
    cursor: { ...state.cursor, row, channel, column: COLUMNS[columnIndex] },
  };
}

export function advanceColumn(state: SessionState, column: ColumnId): SessionState {
  return { ...state, cursor: { ...state.cursor, column } };
}

export function setChip(state: SessionState, chip: ChipId): SessionState {
  if (state.song.chip === chip) {
    return state;
  }
  const song = cloneSong(state.song);
  song.chip = chip;
  const channelCount = chipDefinition(chip).channels.length;
  return commit(
    { ...state, cursor: { ...state.cursor, channel: Math.min(state.cursor.channel, channelCount - 1) } },
    song,
  );
}

export function addPattern(state: SessionState): SessionState {
  const song = cloneSong(state.song);
  const id = nextPatternId(song);
  const pattern = blankPattern(id, nextBlankPatternName(song));
  song.patterns = [...song.patterns, pattern];
  song.order = [...song.order, id];
  return {
    ...commit(state, song),
    cursor: { ...state.cursor, orderIndex: song.order.length - 1, row: 0 },
  };
}

export function duplicatePattern(state: SessionState): SessionState {
  const song = cloneSong(state.song);
  const sourceId = song.order[state.cursor.orderIndex] ?? song.order[0];
  const source = song.patterns.find((item) => item.id === sourceId) ?? song.patterns[0];
  const id = nextPatternId(song);
  const sourceName = source.name || patternDisplayName(source, state.cursor.orderIndex);
  const pattern: Pattern = {
    id,
    name: nextDuplicatePatternName(song, sourceName),
    rows: structuredClone(source.rows),
  };
  song.patterns = [...song.patterns, pattern];
  const insertAt = Math.min(state.cursor.orderIndex + 1, song.order.length);
  song.order = [...song.order.slice(0, insertAt), id, ...song.order.slice(insertAt)];
  return {
    ...commit(state, song),
    cursor: { ...state.cursor, orderIndex: insertAt, row: 0 },
  };
}

export function reorderOrder(state: SessionState, fromIndex: number, toIndex: number): SessionState {
  const song = cloneSong(state.song);
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= song.order.length
    || toIndex >= song.order.length
    || fromIndex === toIndex
  ) {
    return state;
  }
  const order = [...song.order];
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  song.order = order;
  let orderIndex = state.cursor.orderIndex;
  if (orderIndex === fromIndex) {
    orderIndex = toIndex;
  } else if (fromIndex < orderIndex && toIndex >= orderIndex) {
    orderIndex -= 1;
  } else if (fromIndex > orderIndex && toIndex <= orderIndex) {
    orderIndex += 1;
  }
  return {
    ...commit(state, song),
    cursor: { ...state.cursor, orderIndex },
  };
}

export function renamePattern(state: SessionState, id: string, name: string): SessionState {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) {
    return state;
  }
  const song = cloneSong(state.song);
  const existing = song.patterns.find((item) => item.id === id);
  if (!existing || existing.name === trimmed) {
    return state;
  }
  song.patterns = song.patterns.map((item) => (item.id === id ? { ...item, name: trimmed } : item));
  return commit(state, song);
}

export function removeOrderEntry(state: SessionState): SessionState {
  const song = cloneSong(state.song);
  if (song.order.length <= 1) {
    return state;
  }
  const removeIndex = state.cursor.orderIndex;
  const removedId = song.order[removeIndex];
  song.order = song.order.filter((_, index) => index !== removeIndex);
  if (!song.order.includes(removedId)) {
    song.patterns = song.patterns.filter((item) => item.id !== removedId);
  }
  const orderIndex = Math.min(removeIndex, song.order.length - 1);
  return {
    ...commit(state, song),
    cursor: { ...state.cursor, orderIndex, row: 0 },
  };
}

export function clearPattern(state: SessionState): SessionState {
  const song = cloneSong(state.song);
  const pattern = currentPattern(song, state.cursor);
  const cleared: Pattern = {
    ...pattern,
    rows: pattern.rows.map((row) => row.map(() => emptyCell())),
  };
  return commit(state, writePattern(song, cleared));
}

export function addRandomPattern(state: SessionState, seed: number): SessionState {
  const song = cloneSong(state.song);
  const id = nextPatternId(song);
  const pattern = blankPattern(id, nextBlankPatternName(song));
  fillPatternRandom(pattern, song.chip, song.armedInstrumentId, seed);
  song.patterns = [...song.patterns, pattern];
  song.order = [...song.order, id];
  return {
    ...commit(state, song),
    cursor: { ...state.cursor, orderIndex: song.order.length - 1, row: 0 },
  };
}

export function selectOrder(state: SessionState, orderIndex: number): SessionState {
  const clamped = Math.min(Math.max(0, orderIndex), Math.max(0, state.song.order.length - 1));
  return { ...state, cursor: { ...state.cursor, orderIndex: clamped, row: 0 } };
}

/** Move the order cursor during playback without touching undo history. */
export function followPlaybackOrder(state: SessionState, orderIndex: number, row: number): SessionState {
  const clampedOrder = Math.min(Math.max(0, orderIndex), Math.max(0, state.song.order.length - 1));
  const clampedRow = Math.min(PATTERN_ROWS - 1, Math.max(0, row));
  if (state.cursor.orderIndex === clampedOrder && state.cursor.row === clampedRow) {
    return state;
  }
  return {
    ...state,
    cursor: { ...state.cursor, orderIndex: clampedOrder, row: clampedRow },
  };
}

export function updateInstrument(state: SessionState, id: string, patch: Partial<Instrument>): SessionState {
  const song = cloneSong(state.song);
  song.instruments = song.instruments.map((instrument) =>
    instrument.id === id ? { ...instrument, ...patch, id } : instrument,
  );
  return commit(state, song);
}

export function armInstrument(state: SessionState, id: string): SessionState {
  const song = cloneSong(state.song);
  song.armedInstrumentId = id;
  return { ...state, song };
}

export function addInstrument(state: SessionState): SessionState {
  const song = cloneSong(state.song);
  const definition = chipDefinition(song.chip);
  const created = definition.createDefaultInstrument();
  const id = `ins-${song.instruments.length + 1}`;
  const instrument = { ...created, id, name: `${created.name} ${song.instruments.length + 1}` };
  song.instruments = [...song.instruments, instrument];
  song.armedInstrumentId = id;
  return commit(state, song);
}

export function setTempo(state: SessionState, tempo: number): SessionState {
  const song = cloneSong(state.song);
  song.tempo = Math.min(240, Math.max(40, Math.round(tempo)));
  return commit(state, song);
}

export function setName(state: SessionState, name: string): SessionState {
  const song = cloneSong(state.song);
  song.name = name.slice(0, 80);
  return commit(state, song);
}

export function toggleMute(song: Song, channel: number, muted: Set<number>): Set<number> {
  const next = new Set(muted);
  if (next.has(channel)) {
    next.delete(channel);
  } else {
    next.add(channel);
  }
  return next;
}

/**
 * Replace the open song only after the second confirm step.
 * A saved file on disk is never touched here.
 */
export function replaceWithRandom(state: SessionState, seed: number, typed: string): SessionState {
  if (!confirmationAccepted(typed)) {
    return state;
  }
  const song = randomSong(state.song.chip, seed);
  return {
    song,
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: state.octave,
    past: [...state.past, state.song].slice(-100),
    future: [],
  };
}

export function loadSong(state: SessionState, song: Song): SessionState {
  const patterns = song.patterns.map((pattern, index) => ({
    ...pattern,
    name: pattern.name?.trim() ? pattern.name.trim().slice(0, 40) : `Pattern ${index + 1}`,
  }));
  return {
    song: { ...song, patterns },
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: state.octave,
    past: [],
    future: [],
  };
}

/** Add a snip as a new instrument and arm it. The input song is not mutated. */
export function addSnipInstrument(song: Song, name: string, frames: number[][]): { song: Song; instrumentId: string } {
  const id = `snip-${song.instruments.length + 1}`;
  const instrument = baseInstrument({
    id,
    name: name.slice(0, 40) || 'Snip',
    kind: 'snip',
    frames: frames.map((frame) => frame.slice(0, 16)),
  });
  return {
    instrumentId: id,
    song: {
      ...song,
      instruments: [...song.instruments, instrument],
      armedInstrumentId: id,
    },
  };
}

export function setOctave(state: SessionState, octave: number): SessionState {
  return { ...state, octave: Math.min(7, Math.max(1, octave)) };
}
