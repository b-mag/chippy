/**
 * Framework-free song model. Angular, the engines, and the file writers
 * all import this barrel and nothing underneath it.
 */
export {
  PATTERN_ROWS,
  PROJECT_VERSION,
  type Cell,
  type ChipId,
  type ColumnId,
  type Cursor,
  type Instrument,
  type InstrumentKind,
  type Pattern,
  type Song,
} from './lib/types';
export {
  type ChipDefinition,
  type InstrumentField,
  chipDefinition,
  chipIds,
} from './lib/chips';
export { emptyCell, newSong } from './lib/song-factory';
export {
  addInstrument,
  addPattern,
  addRandomPattern,
  addSnipInstrument,
  armInstrument,
  armedInstrument,
  clearPattern,
  confirmationAccepted,
  duplicateBaseName,
  duplicatePattern,
  followPlaybackOrder,
  formatNote,
  loadSong,
  newSession,
  nextBlankPatternName,
  nextDuplicatePatternName,
  noteFromKey,
  patternDisplayName,
  removeOrderEntry,
  renamePattern,
  reorderOrder,
  replaceWithRandom,
  selectOrder,
  setChip,
  setName,
  setOctave,
  setTempo,
  updateInstrument,
  type SessionState,
  advanceColumn,
  clearCell,
  enterCut,
  enterNote,
  moveCursor,
  redo,
  setVolume,
  undo,
} from './lib/session';
export { fillPatternRandom, randomSong } from './lib/random-song';
