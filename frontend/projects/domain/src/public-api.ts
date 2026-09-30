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
  addSnipInstrument,
  armInstrument,
  armedInstrument,
  confirmationAccepted,
  formatNote,
  loadSong,
  newSession,
  noteFromKey,
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
export { randomSong } from './lib/random-song';
