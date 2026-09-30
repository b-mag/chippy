import { chipDefinition } from './chips';
import { PATTERN_ROWS, PROJECT_VERSION, type Cell, type ChipId, type Pattern, type Song } from './types';

export function emptyCell(): Cell {
  return { note: null, cut: false, instrumentId: null, volume: null };
}

export function blankPattern(id: string, name = 'Pattern 1'): Pattern {
  const rows: Cell[][] = [];
  for (let row = 0; row < PATTERN_ROWS; row += 1) {
    rows.push(Array.from({ length: 4 }, () => emptyCell()));
  }
  return { id, name, rows };
}

/** A new project: one pattern, one armed instrument, ready for the first key. */
export function newSong(chip: ChipId, name = 'Untitled'): Song {
  const instrument = chipDefinition(chip).createDefaultInstrument();
  const pattern = blankPattern('pat-1', 'Pattern 1');
  return {
    version: PROJECT_VERSION,
    name,
    chip,
    tempo: 120,
    order: [pattern.id],
    patterns: [pattern],
    instruments: [instrument],
    armedInstrumentId: instrument.id,
  };
}
