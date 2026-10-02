import {
  baseInstrument,
  channelIsPlaceholder,
  chipDefinition,
  instrumentForChannel,
  kindAllowedOnChannel,
} from './chips';
import {
  defaultRoleForKind,
  instrumentFromPreset,
  instrumentToPresetPatch,
  type InstrumentPreset,
} from './presets';
import { ensureChannelInstruments, fillPatternRandom, randomProject } from './random-song';
import {
  addHierarchyTable,
  allocateChainAt,
  allocatePhraseAt,
  canExpandFlatToHierarchy,
  clearPhrase,
  expandFlatToHierarchy,
  focusedPhraseIndex,
  reexpandHierarchyFromFlat,
  setChainStep,
  setHierarchyFocus,
  setLsdjEnabled,
  setSequenceCell,
  syncFlatProjection,
  updateHierarchyGroove,
  updateHierarchyTable,
  writeFlatCell,
  writePhraseStep,
  type LsdjFocus,
  type LsdjTable,
} from './lsdj-hierarchy';
import {
  activeSongBody,
  blankPattern,
  blankSongBody,
  emptyCell,
  newProject,
  songForRender,
  withActiveSong,
} from './song-factory';
import {
  PATTERN_ROWS,
  PROJECT_VERSION,
  effectCmdsForChip,
  effectValueMax,
  type Cell,
  type CellEffect,
  type ChipId,
  type ColumnId,
  type Cursor,
  type CustomInstrumentPreset,
  type Instrument,
  type InstrumentKind,
  type Pattern,
  type PresetRole,
  type Project,
  type Song,
  type SongBody,
} from './types';

const BLANK_PATTERN_NAME = /^Pattern (\d+)$/;
const DUPLICATE_SUFFIX = /^(.*) \((\d+)\)$/;

type PatternHost = Pick<SongBody, 'patterns' | 'order'>;

/** Next `"Pattern N"` name based on existing pattern names. */
export function nextBlankPatternName(host: PatternHost): string {
  let max = 0;
  for (const pattern of host.patterns) {
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
export function nextDuplicatePatternName(host: PatternHost, sourceName: string): string {
  const base = duplicateBaseName(sourceName);
  let max = 0;
  for (const pattern of host.patterns) {
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

function nextPatternId(host: PatternHost): string {
  let max = 0;
  for (const pattern of host.patterns) {
    const match = /^pat-(\d+)$/.exec(pattern.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `pat-${max + 1}`;
}

function nextSongId(project: Project): string {
  let max = 0;
  for (const song of project.songs) {
    const match = /^song-(\d+)$/.exec(song.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `song-${max + 1}`;
}

function nextInstrumentId(project: Project, prefix = 'ins'): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const instrument of project.instruments) {
    const match = pattern.exec(instrument.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `${prefix}-${max + 1}`;
}

/** Display name when an older file omitted `pattern.name`. */
export function patternDisplayName(pattern: Pattern, fallbackIndex: number): string {
  if (pattern.name && pattern.name.trim()) {
    return pattern.name;
  }
  return `Pattern ${fallbackIndex + 1}`;
}

const COLUMNS: ColumnId[] = ['note', 'instrument', 'volume', 'effect'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Lower keyboard row, tracker layout. Z is C. */
const LOWER_ROW = 'zsxdcvgbhnjm';
/** Upper keyboard row, one octave higher. Q is C. */
const UPPER_ROW = 'q2w3er5t6y7u';

/** Phrase slot reference kept when a Game Boy `.sav` was opened (files layer fills this). */
export interface LsdjPhraseRef {
  phrase: number;
  transpose: number;
}

/**
 * Import map for patch-in-place `.sav` re-export.
 * Phrase, chain, and table slots live on the hierarchy itself, so this only carries
 * what the hierarchy cannot: which instrument slots Chippy is allowed to overwrite,
 * and which hierarchy slots were allocated in the opened file.
 */
export interface LsdjImportMap {
  editableInstruments: number[];
  /** Table slots that were already allocated in the opened `.sav`. */
  allocatedTables: number[];
}

export interface SessionState {
  project: Project;
  cursor: Cursor;
  octave: number;
  past: Project[];
  future: Project[];
  dirty: boolean;
  /** Full 128 KiB `.sav` from open; null when not opened from LSDJ. */
  lsdjSavBase: Uint8Array | null;
  /** Phrase map from decode for patch-in-place export. */
  lsdjImportMap: LsdjImportMap | null;
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
    project: newProject(chip),
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: 4,
    past: [],
    future: [],
    dirty: false,
    lsdjSavBase: null,
    lsdjImportMap: null,
  };
}

/** Attach an opened LSDJ `.sav` for patch-in-place re-export. */
export function setLsdjOverlay(
  state: SessionState,
  savBase: Uint8Array,
  importMap: LsdjImportMap,
): SessionState {
  return {
    ...state,
    lsdjSavBase: new Uint8Array(savBase),
    lsdjImportMap: structuredClone(importMap),
  };
}

/** Drop LSDJ overlay (new project, JSON open, chip change). */
export function clearLsdjOverlay(state: SessionState): SessionState {
  if (!state.lsdjSavBase && !state.lsdjImportMap) {
    return state;
  }
  return {
    ...state,
    lsdjSavBase: null,
    lsdjImportMap: null,
  };
}

export function armedInstrument(project: Project): Instrument {
  return project.instruments.find((item) => item.id === project.armedInstrumentId) ?? project.instruments[0];
}

function cloneProject(project: Project): Project {
  return structuredClone(project);
}

function commit(state: SessionState, project: Project): SessionState {
  return {
    ...state,
    project,
    past: [...state.past, state.project].slice(-100),
    future: [],
    dirty: true,
  };
}

function mutateActiveSong(state: SessionState, mutate: (body: SongBody) => SongBody): SessionState {
  const project = cloneProject(state.project);
  const body = activeSongBody(project);
  const nextBody = mutate(structuredClone(body));
  return commit(state, withActiveSong(project, nextBody));
}

export function undo(state: SessionState): SessionState {
  const previous = state.past[state.past.length - 1];
  if (!previous) {
    return state;
  }
  return {
    ...state,
    project: previous,
    past: state.past.slice(0, -1),
    future: [state.project, ...state.future],
    dirty: true,
  };
}

export function redo(state: SessionState): SessionState {
  const next = state.future[0];
  if (!next) {
    return state;
  }
  return {
    ...state,
    project: next,
    past: [...state.past, state.project],
    future: state.future.slice(1),
    dirty: true,
  };
}

function currentPattern(body: SongBody, cursor: Cursor): Pattern {
  const id = body.order[cursor.orderIndex] ?? body.order[0];
  return body.patterns.find((pattern) => pattern.id === id) ?? body.patterns[0];
}

function writePattern(body: SongBody, pattern: Pattern): SongBody {
  return {
    ...body,
    patterns: body.patterns.map((item) => (item.id === pattern.id ? pattern : item)),
  };
}

/**
 * Route a cell write to the right canonical store: the focused LSDJ phrase while LSDJ mode
 * is on, the phrase behind the flat block when the hierarchy exists but the mode is off,
 * and the pattern itself for plain Chippy songs.
 */
function writeCursorCell(body: SongBody, cursor: Cursor, cell: Cell): SongBody {
  if (body.lsdj?.enabled) {
    const phrase = focusedPhraseIndex(body.lsdj, cursor.channel);
    return phrase === null ? body : writePhraseStep(body, phrase, cursor.row, cell);
  }
  if (body.lsdj) {
    return writeFlatCell(body, cursor.orderIndex, cursor.channel, cursor.row, cell);
  }
  const pattern = currentPattern(body, cursor);
  const rows = pattern.rows.map((row) => row.map((item) => ({ ...item })));
  rows[cursor.row][cursor.channel] = cell;
  return writePattern(body, { ...pattern, rows });
}

function writeCell(state: SessionState, cell: Cell, advance: boolean): SessionState {
  if (channelIsPlaceholder(state.project.chip, state.cursor.channel)) {
    return state;
  }
  const next = mutateActiveSong(state, (body) => writeCursorCell(body, state.cursor, cell));
  if (!advance) {
    return next;
  }
  const row = (state.cursor.row + 1) % PATTERN_ROWS;
  return { ...next, cursor: { ...state.cursor, row } };
}

/**
 * Resolve an instrument that can play on the cursor channel.
 * Auto-creates a matching instrument when the bank has none for that channel kind.
 */
function resolveInstrumentForCursor(state: SessionState): { state: SessionState; instrument: Instrument } {
  const channel = state.cursor.channel;
  const match = instrumentForChannel(
    state.project.chip,
    state.project.instruments,
    state.project.armedInstrumentId,
    channel,
  );
  if (match) {
    return { state, instrument: match };
  }
  const ensured = ensureChannelInstruments(state.project);
  const created = instrumentForChannel(
    ensured.chip,
    ensured.instruments,
    ensured.armedInstrumentId,
    channel,
  ) ?? ensured.instruments[0];
  return {
    state: ensured === state.project ? state : commit(state, ensured),
    instrument: created,
  };
}

/** Write a note with a channel-compatible instrument, and move down one row. */
export function enterNote(state: SessionState, midi: number): SessionState {
  if (channelIsPlaceholder(state.project.chip, state.cursor.channel)) {
    return state;
  }
  const resolved = resolveInstrumentForCursor(state);
  state = resolved.state;
  const body = activeSongBody(state.project);
  const pattern = currentPattern(body, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  const next = writeCell(
    state,
    {
      note: midi,
      cut: false,
      instrumentId: resolved.instrument.id,
      volume: null,
      effect: existing?.effect ?? null,
    },
    true,
  );
  if (resolved.instrument.id !== state.project.armedInstrumentId
    && kindAllowedOnChannel(state.project.chip, state.cursor.channel, resolved.instrument.kind)) {
    return { ...next, project: { ...next.project, armedInstrumentId: resolved.instrument.id } };
  }
  return next;
}

export function enterCut(state: SessionState): SessionState {
  const body = activeSongBody(state.project);
  const pattern = currentPattern(body, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  return writeCell(
    state,
    { note: null, cut: true, instrumentId: null, volume: null, effect: existing?.effect ?? null },
    true,
  );
}

export function clearCell(state: SessionState): SessionState {
  return writeCell(state, emptyCell(), false);
}

export function setVolume(state: SessionState, volume: number): SessionState {
  const body = activeSongBody(state.project);
  const pattern = currentPattern(body, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  return writeCell(state, { ...existing, volume, effect: existing.effect ?? null }, true);
}

export function setEffect(state: SessionState, effect: CellEffect | null): SessionState {
  const body = activeSongBody(state.project);
  const pattern = currentPattern(body, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  let nextEffect = effect;
  if (nextEffect) {
    const chip = state.project.chip;
    const cmds = effectCmdsForChip(chip);
    const max = effectValueMax(chip);
    if (!cmds.includes(nextEffect.cmd)) {
      nextEffect = null;
    } else {
      nextEffect = {
        cmd: nextEffect.cmd,
        value: Math.min(max, Math.max(0, Math.floor(nextEffect.value))),
      };
    }
  }
  return writeCell(state, { ...existing, effect: nextEffect, volume: existing.volume ?? null }, true);
}

/** Assign an instrument to the current cell (tracker instrument column). */
export function setCellInstrument(state: SessionState, instrumentId: string | null): SessionState {
  const body = activeSongBody(state.project);
  const pattern = currentPattern(body, state.cursor);
  const existing = pattern.rows[state.cursor.row][state.cursor.channel];
  const next = writeCell(
    state,
    { ...existing, instrumentId, volume: existing.volume ?? null, effect: existing.effect ?? null },
    true,
  );
  if (!instrumentId) {
    return next;
  }
  return { ...next, project: { ...next.project, armedInstrumentId: instrumentId } };
}

/** Resolve a typed instrument number (1-9, or hex digit matching the panel label) to an id. */
export function findInstrumentIdByNumberLabel(project: Project, label: string): string | null {
  const needle = label.toLowerCase();
  const match = project.instruments.find((instrument) => {
    const short = instrument.id.replace(/^ins-/, '').replace(/^snip-/, 's').toLowerCase();
    return short === needle;
  });
  return match?.id ?? null;
}

export function moveCursor(state: SessionState, deltaRow: number, deltaChannel: number, deltaColumn: number): SessionState {
  const channelCount = chipDefinition(state.project.chip).channels.length;
  // The Phrase screen shows one channel, so columns wrap in place instead of spilling
  // into the neighbouring channel the way the flat Pattern grid does.
  const wrapInChannel = activeSongBody(state.project).lsdj?.enabled === true;
  let columnIndex = COLUMNS.indexOf(state.cursor.column) + deltaColumn;
  let channel = state.cursor.channel;
  if (columnIndex < 0) {
    columnIndex = COLUMNS.length - 1;
    channel -= wrapInChannel ? 0 : 1;
  } else if (columnIndex >= COLUMNS.length) {
    columnIndex = 0;
    channel += wrapInChannel ? 0 : 1;
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

/**
 * Changing chip discards the entire project and starts a blank one.
 * Callers must confirm with the user before invoking this.
 */
export function newProjectForChip(state: SessionState, chip: ChipId): SessionState {
  return {
    project: newProject(chip),
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: state.octave,
    past: [],
    future: [],
    dirty: false,
    lsdjSavBase: null,
    lsdjImportMap: null,
  };
}

/** @deprecated Use newProjectForChip after user confirm. Kept name for older call sites. */
export function setChip(state: SessionState, chip: ChipId): SessionState {
  if (state.project.chip === chip) {
    return state;
  }
  return newProjectForChip(state, chip);
}

export function addPattern(state: SessionState): SessionState {
  const channelCount = chipDefinition(state.project.chip).channels.length;
  const next = mutateActiveSong(state, (body) => {
    const id = nextPatternId(body);
    const pattern = blankPattern(id, nextBlankPatternName(body), channelCount);
    const arranged = {
      ...body,
      patterns: [...body.patterns, pattern],
      order: [...body.order, id],
    };
    return body.lsdj ? reexpandHierarchyFromFlat(arranged, channelCount) : arranged;
  });
  const orderLength = activeSongBody(next.project).order.length;
  return {
    ...next,
    cursor: { ...state.cursor, orderIndex: orderLength - 1, row: 0 },
  };
}

export function duplicatePattern(state: SessionState): SessionState {
  let insertAt = state.cursor.orderIndex + 1;
  const channelCount = chipDefinition(state.project.chip).channels.length;
  const next = mutateActiveSong(state, (body) => {
    const sourceId = body.order[state.cursor.orderIndex] ?? body.order[0];
    const source = body.patterns.find((item) => item.id === sourceId) ?? body.patterns[0];
    const id = nextPatternId(body);
    const sourceName = source.name || patternDisplayName(source, state.cursor.orderIndex);
    const pattern: Pattern = {
      id,
      name: nextDuplicatePatternName(body, sourceName),
      rows: structuredClone(source.rows),
    };
    insertAt = Math.min(state.cursor.orderIndex + 1, body.order.length);
    const arranged = {
      ...body,
      patterns: [...body.patterns, pattern],
      order: [...body.order.slice(0, insertAt), id, ...body.order.slice(insertAt)],
    };
    return body.lsdj ? reexpandHierarchyFromFlat(arranged, channelCount) : arranged;
  });
  return {
    ...next,
    cursor: { ...state.cursor, orderIndex: insertAt, row: 0 },
  };
}

export function reorderOrder(state: SessionState, fromIndex: number, toIndex: number): SessionState {
  const body = activeSongBody(state.project);
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= body.order.length
    || toIndex >= body.order.length
    || fromIndex === toIndex
  ) {
    return state;
  }
  let orderIndex = state.cursor.orderIndex;
  const channelCount = chipDefinition(state.project.chip).channels.length;
  const next = mutateActiveSong(state, (current) => {
    const order = [...current.order];
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    const arranged = { ...current, order };
    return current.lsdj ? reexpandHierarchyFromFlat(arranged, channelCount) : arranged;
  });
  if (orderIndex === fromIndex) {
    orderIndex = toIndex;
  } else if (fromIndex < orderIndex && toIndex >= orderIndex) {
    orderIndex -= 1;
  } else if (fromIndex > orderIndex && toIndex <= orderIndex) {
    orderIndex += 1;
  }
  return {
    ...next,
    cursor: { ...state.cursor, orderIndex },
  };
}

export function renamePattern(state: SessionState, id: string, name: string): SessionState {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) {
    return state;
  }
  const body = activeSongBody(state.project);
  const existing = body.patterns.find((item) => item.id === id);
  if (!existing || existing.name === trimmed) {
    return state;
  }
  if (body.lsdj) {
    // Flat blocks are derived from the hierarchy; LSDJ phrases are numbered, not named.
    return state;
  }
  return mutateActiveSong(state, (current) => ({
    ...current,
    patterns: current.patterns.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
  }));
}

export function removeOrderEntry(state: SessionState): SessionState {
  const body = activeSongBody(state.project);
  if (body.order.length <= 1) {
    return state;
  }
  const removeIndex = state.cursor.orderIndex;
  const channelCount = chipDefinition(state.project.chip).channels.length;
  const next = mutateActiveSong(state, (current) => {
    const removedId = current.order[removeIndex];
    const order = current.order.filter((_, index) => index !== removeIndex);
    const patterns = order.includes(removedId)
      ? current.patterns
      : current.patterns.filter((item) => item.id !== removedId);
    const arranged = { ...current, order, patterns };
    return current.lsdj ? reexpandHierarchyFromFlat(arranged, channelCount) : arranged;
  });
  const orderIndex = Math.min(removeIndex, activeSongBody(next.project).order.length - 1);
  return {
    ...next,
    cursor: { ...state.cursor, orderIndex, row: 0 },
  };
}

export function clearPattern(state: SessionState): SessionState {
  return mutateActiveSong(state, (body) => {
    if (body.lsdj?.enabled) {
      const phrase = focusedPhraseIndex(body.lsdj, state.cursor.channel);
      return phrase === null ? body : clearPhrase(body, phrase);
    }
    if (body.lsdj) {
      let next = body;
      for (let channel = 0; channel < 4; channel += 1) {
        for (let row = 0; row < PATTERN_ROWS; row += 1) {
          next = writeFlatCell(next, state.cursor.orderIndex, channel, row, emptyCell());
        }
      }
      return next;
    }
    const pattern = currentPattern(body, state.cursor);
    const cleared: Pattern = {
      ...pattern,
      rows: pattern.rows.map((row) => row.map(() => emptyCell())),
    };
    return writePattern(body, cleared);
  });
}

export function addRandomPattern(state: SessionState, seed: number): SessionState {
  const ensured = ensureChannelInstruments(state.project);
  const withInstruments = ensured === state.project ? state : commit(state, ensured);
  const channelCount = chipDefinition(withInstruments.project.chip).channels.length;
  const next = mutateActiveSong(withInstruments, (body) => {
    const id = nextPatternId(body);
    const pattern = blankPattern(id, nextBlankPatternName(body), channelCount);
    fillPatternRandom(
      pattern,
      withInstruments.project.chip,
      withInstruments.project.instruments,
      withInstruments.project.armedInstrumentId,
      seed,
    );
    const arranged = {
      ...body,
      patterns: [...body.patterns, pattern],
      order: [...body.order, id],
    };
    return body.lsdj ? reexpandHierarchyFromFlat(arranged, channelCount) : arranged;
  });
  return {
    ...next,
    cursor: { ...state.cursor, orderIndex: activeSongBody(next.project).order.length - 1, row: 0 },
  };
}

export function selectOrder(state: SessionState, orderIndex: number): SessionState {
  const body = activeSongBody(state.project);
  const clamped = Math.min(Math.max(0, orderIndex), Math.max(0, body.order.length - 1));
  return { ...state, cursor: { ...state.cursor, orderIndex: clamped, row: 0 } };
}

/** Move the order cursor during playback without touching undo history. */
export function followPlaybackOrder(state: SessionState, orderIndex: number, row: number): SessionState {
  const body = activeSongBody(state.project);
  const clampedOrder = Math.min(Math.max(0, orderIndex), Math.max(0, body.order.length - 1));
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
  const project = cloneProject(state.project);
  project.instruments = project.instruments.map((instrument) =>
    instrument.id === id ? { ...instrument, ...patch, id } : instrument,
  );
  return commit(state, project);
}

export function renameInstrument(state: SessionState, id: string, name: string): SessionState {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) {
    return state;
  }
  return updateInstrument(state, id, { name: trimmed });
}

export function changeInstrumentKind(state: SessionState, id: string, kind: InstrumentKind): SessionState {
  const definition = chipDefinition(state.project.chip);
  if (!definition.kinds.includes(kind)) {
    return state;
  }
  const existing = state.project.instruments.find((item) => item.id === id);
  if (!existing || existing.kind === kind) {
    return state;
  }
  const created = definition.createInstrument(kind);
  return updateInstrument(state, id, {
    ...created,
    id,
    name: existing.name,
  });
}

export function deleteInstrument(state: SessionState, id: string): SessionState {
  if (state.project.instruments.length <= 1) {
    return state;
  }
  const project = cloneProject(state.project);
  const remaining = project.instruments.filter((item) => item.id !== id);
  if (remaining.length === project.instruments.length) {
    return state;
  }
  const fallback = remaining[0].id;
  project.instruments = remaining;
  if (project.armedInstrumentId === id) {
    project.armedInstrumentId = fallback;
  }
  project.songs = project.songs.map((song) => ({
    ...song,
    patterns: song.patterns.map((pattern) => ({
      ...pattern,
      rows: pattern.rows.map((row) =>
        row.map((cell) => (cell.instrumentId === id ? { ...cell, instrumentId: fallback } : cell)),
      ),
    })),
  }));
  return commit(state, project);
}

export function armInstrument(state: SessionState, id: string): SessionState {
  const project = cloneProject(state.project);
  project.armedInstrumentId = id;
  return { ...state, project };
}

export function addInstrument(state: SessionState, kind?: InstrumentKind): SessionState {
  const project = cloneProject(state.project);
  const definition = chipDefinition(project.chip);
  const channel = definition.channels[state.cursor.channel];
  const forChannel = channel ? definition.kindsForChannel(channel.id) : [];
  // A placeholder column offers no kinds; fall back to everything the chip makes.
  const allowed = forChannel.length > 0 ? forChannel : definition.kinds;
  const chosen = kind && allowed.includes(kind) ? kind : allowed[0];
  const created = definition.createInstrument(chosen);
  const id = nextInstrumentId(project);
  const instrument = { ...created, id, name: `${created.name} ${project.instruments.length + 1}` };
  project.instruments = [...project.instruments, instrument];
  project.armedInstrumentId = id;
  return commit(state, project);
}

export function addInstrumentFromPreset(state: SessionState, preset: InstrumentPreset): SessionState {
  if (preset.chip !== state.project.chip) {
    return state;
  }
  const project = cloneProject(state.project);
  const id = nextInstrumentId(project);
  const instrument = instrumentFromPreset(preset, id);
  project.instruments = [...project.instruments, instrument];
  project.armedInstrumentId = id;
  return commit(state, project);
}

function nextCustomPresetId(project: Project): string {
  let index = (project.customPresets?.length ?? 0) + 1;
  const used = new Set((project.customPresets ?? []).map((item) => item.id));
  while (used.has(`custom-${index}`)) {
    index += 1;
  }
  return `custom-${index}`;
}

/** Save the armed instrument as a project-scoped custom preset. */
export function saveCustomPreset(
  state: SessionState,
  name: string,
  role: PresetRole = defaultRoleForKind(armedInstrument(state.project).kind),
): SessionState {
  const armed = armedInstrument(state.project);
  const trimmed = name.trim().slice(0, 40) || armed.name;
  const project = cloneProject(state.project);
  if (!project.customPresets) {
    project.customPresets = [];
  }
  const custom: CustomInstrumentPreset = {
    id: nextCustomPresetId(project),
    name: trimmed,
    chip: project.chip,
    kind: armed.kind,
    role,
    patch: instrumentToPresetPatch(armed),
  };
  project.customPresets = [...project.customPresets, custom];
  return commit(state, project);
}

export function removeCustomPreset(state: SessionState, id: string): SessionState {
  const project = cloneProject(state.project);
  const next = (project.customPresets ?? []).filter((item) => item.id !== id);
  if (next.length === (project.customPresets ?? []).length) {
    return state;
  }
  project.customPresets = next;
  return commit(state, project);
}

export function addInstrumentFromCustomPreset(state: SessionState, id: string): SessionState {
  const custom = (state.project.customPresets ?? []).find((item) => item.id === id);
  if (!custom || custom.chip !== state.project.chip) {
    return state;
  }
  return addInstrumentFromPreset(state, {
    id: custom.id,
    name: custom.name,
    chip: custom.chip,
    kind: custom.kind,
    role: custom.role,
    premium: false,
    patch: custom.patch,
  });
}

/**
 * Import an external custom preset: append to project customs (new id) and add/arm an instrument.
 * No-ops when the preset chip does not match the open project.
 */
export function importCustomPreset(
  state: SessionState,
  preset: Omit<CustomInstrumentPreset, 'id'> | CustomInstrumentPreset,
): SessionState {
  if (preset.chip !== state.project.chip) {
    return state;
  }
  const project = cloneProject(state.project);
  if (!project.customPresets) {
    project.customPresets = [];
  }
  const custom: CustomInstrumentPreset = {
    id: nextCustomPresetId(project),
    name: preset.name.trim().slice(0, 40) || 'Imported',
    chip: preset.chip,
    kind: preset.kind,
    role: preset.role,
    patch: preset.patch,
  };
  project.customPresets = [...project.customPresets, custom];
  return addInstrumentFromCustomPreset(commit(state, project), custom.id);
}

export function setTempo(state: SessionState, tempo: number): SessionState {
  return mutateActiveSong(state, (body) => ({
    ...body,
    tempo: Math.min(240, Math.max(40, Math.round(tempo))),
  }));
}

export function setName(state: SessionState, name: string): SessionState {
  const project = cloneProject(state.project);
  project.name = name.slice(0, 80);
  return commit(state, project);
}

export function setSongName(state: SessionState, name: string): SessionState {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) {
    return state;
  }
  return mutateActiveSong(state, (body) => ({ ...body, name: trimmed }));
}

export function selectSong(state: SessionState, songId: string): SessionState {
  if (!state.project.songs.some((song) => song.id === songId)) {
    return state;
  }
  return {
    ...state,
    project: { ...state.project, activeSongId: songId },
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
  };
}

export function addSong(state: SessionState): SessionState {
  const project = cloneProject(state.project);
  const id = nextSongId(project);
  const body = blankSongBody(id, `Song ${project.songs.length + 1}`);
  project.songs = [...project.songs, body];
  project.activeSongId = id;
  return {
    ...commit(state, project),
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
  };
}

export function removeSong(state: SessionState): SessionState {
  if (state.project.songs.length <= 1) {
    return state;
  }
  const project = cloneProject(state.project);
  const remaining = project.songs.filter((song) => song.id !== project.activeSongId);
  project.songs = remaining;
  project.activeSongId = remaining[0].id;
  return {
    ...commit(state, project),
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
  };
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
 * Replace the open project only after the second confirm step.
 * A saved file on disk is never touched here.
 */
export function replaceWithRandom(state: SessionState, seed: number, typed: string): SessionState {
  if (!confirmationAccepted(typed)) {
    return state;
  }
  const project = randomProject(state.project.chip, seed);
  return {
    project,
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: state.octave,
    past: [...state.past, state.project].slice(-100),
    future: [],
    dirty: true,
    lsdjSavBase: null,
    lsdjImportMap: null,
  };
}

export function loadProject(state: SessionState, project: Project): SessionState {
  const songs = project.songs.map((song) => ({
    ...song,
    patterns: song.patterns.map((pattern, index) => ({
      ...pattern,
      name: pattern.name?.trim() ? pattern.name.trim().slice(0, 40) : `Pattern ${index + 1}`,
    })),
  }));
  return {
    project: {
      ...project,
      version: PROJECT_VERSION,
      songs,
      customPresets: Array.isArray(project.customPresets) ? project.customPresets : [],
    },
    cursor: { orderIndex: 0, row: 0, channel: 0, column: 'note' },
    octave: state.octave,
    past: [],
    future: [],
    dirty: false,
    // JSON / non-sav loads clear the overlay; sav open re-attaches via setLsdjOverlay.
    lsdjSavBase: null,
    lsdjImportMap: null,
  };
}

/** @deprecated Prefer loadProject. */
export function loadSong(state: SessionState, song: Song | Project): SessionState {
  if ('songs' in song && Array.isArray((song as Project).songs)) {
    return loadProject(state, song as Project);
  }
  // Legacy flat Song → wrap
  const flat = song as Song;
  const body: SongBody = {
    id: 'song-1',
    name: flat.name || 'Song 1',
    tempo: flat.tempo,
    order: flat.order,
    patterns: flat.patterns,
  };
  return loadProject(state, {
    version: PROJECT_VERSION,
    name: flat.name,
    chip: flat.chip,
    instruments: flat.instruments,
    armedInstrumentId: flat.armedInstrumentId,
    songs: [body],
    activeSongId: body.id,
    customPresets: [],
  });
}

export function markClean(state: SessionState): SessionState {
  return { ...state, dirty: false };
}

/** Add a snip as a new instrument and arm it. The input project is not mutated. */
export function addSnipInstrument(project: Project, name: string, frames: number[][]): { project: Project; instrumentId: string } {
  const id = nextInstrumentId(project, 'snip');
  const instrument = baseInstrument({
    id,
    name: name.slice(0, 40) || 'Snip',
    kind: 'snip',
    frames: frames.map((frame) => frame.slice(0, 16)),
  });
  return {
    instrumentId: id,
    project: {
      ...project,
      instruments: [...project.instruments, instrument],
      armedInstrumentId: id,
    },
  };
}

export function setOctave(state: SessionState, octave: number): SessionState {
  return { ...state, octave: Math.min(7, Math.max(1, octave)) };
}

/** Whether LSDJ mode can be switched on for the active song. */
export function lsdjModeAvailability(
  state: SessionState,
): { ok: true } | { ok: false; reason: string } {
  if (state.project.chip !== 'gameboy') {
    return { ok: false, reason: 'LSDJ mode is Game Boy only.' };
  }
  return canExpandFlatToHierarchy(activeSongBody(state.project), 4);
}

/** Turn the LSDJ mode screens on, expanding a flat song into a hierarchy the first time. */
export function enableLsdjMode(state: SessionState): SessionState {
  if (lsdjModeAvailability(state).ok !== true) {
    return state;
  }
  return mutateActiveSong(state, (body) => expandFlatToHierarchy(body, 4));
}

/** Turn the LSDJ mode screens off. The hierarchy stays canonical behind the flat grid. */
export function disableLsdjMode(state: SessionState): SessionState {
  return mutateActiveSong(state, (body) => setLsdjEnabled(body, false));
}

export function toggleLsdjMode(state: SessionState): SessionState {
  return activeSongBody(state.project).lsdj?.enabled ? disableLsdjMode(state) : enableLsdjMode(state);
}

/** Select a Song screen cell: moves the cursor channel and re-targets Chain + Phrase. */
export function selectSongCell(state: SessionState, channel: number, songRow: number): SessionState {
  const next = mutateActiveSong(state, (body) => setHierarchyFocus(body, { songRow }));
  return {
    ...next,
    cursor: { ...next.cursor, channel: Math.min(3, Math.max(0, channel)) },
  };
}

/** Select a Chain screen step, which re-targets the Phrase screen. */
export function selectChainStep(state: SessionState, chainStep: number): SessionState {
  return mutateActiveSong(state, (body) => setHierarchyFocus(body, { chainStep }));
}

export function focusHierarchy(state: SessionState, patch: Partial<LsdjFocus>): SessionState {
  return mutateActiveSong(state, (body) => setHierarchyFocus(body, patch));
}

/** Type a chain number into a Song screen cell (null clears it). */
export function writeSongCell(
  state: SessionState,
  channel: number,
  songRow: number,
  chain: number | null,
): SessionState {
  return mutateActiveSong(state, (body) => setSequenceCell(body, channel, songRow, chain));
}

/** Put the next free chain into a Song screen cell and select it. */
export function addChainAt(state: SessionState, channel: number, songRow: number): SessionState {
  return mutateActiveSong(state, (body) => allocateChainAt(body, channel, songRow));
}

/** Type a phrase number or transpose into a Chain screen step. */
export function writeChainStep(
  state: SessionState,
  chainIndex: number,
  step: number,
  patch: { phrase?: number | null; transpose?: number },
): SessionState {
  return mutateActiveSong(state, (body) => setChainStep(body, chainIndex, step, patch));
}

/** Put the next free phrase into a Chain screen step and select it. */
export function addPhraseAt(state: SessionState, chainIndex: number, step: number): SessionState {
  return mutateActiveSong(state, (body) => allocatePhraseAt(body, chainIndex, step));
}

export function writeGroove(state: SessionState, grooveIndex: number, steps: number[]): SessionState {
  return mutateActiveSong(state, (body) => updateHierarchyGroove(body, grooveIndex, steps));
}

export function writeTable(state: SessionState, table: LsdjTable): SessionState {
  return mutateActiveSong(state, (body) => updateHierarchyTable(body, table));
}

export function addTable(state: SessionState): SessionState {
  return mutateActiveSong(state, (body) => addHierarchyTable(body));
}

export function refreshLsdjProjection(state: SessionState): SessionState {
  return mutateActiveSong(state, (body) => syncFlatProjection(body));
}

export { activeSongBody, songForRender };
