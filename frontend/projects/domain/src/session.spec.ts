import { describe, expect, it } from 'vitest';
import {
  addInstrument,
  addPattern,
  addRandomPattern,
  advanceColumn,
  armInstrument,
  clearCell,
  clearPattern,
  duplicateBaseName,
  duplicatePattern,
  enterCut,
  enterNote,
  followPlaybackOrder,
  loadSong,
  moveCursor,
  newSession,
  newSong,
  nextBlankPatternName,
  nextDuplicatePatternName,
  noteFromKey,
  patternDisplayName,
  redo,
  removeOrderEntry,
  renamePattern,
  reorderOrder,
  selectOrder,
  setChip,
  setName,
  setOctave,
  setTempo,
  setVolume,
  undo,
  updateInstrument,
  chipDefinition,
  chipIds,
} from '@chippy/domain';
import { toggleMute } from './lib/session';

describe('session editing', () => {
  it('maps piano keys and ignores unknown keys', () => {
    expect(noteFromKey('z', 4)).toBe(60);
    expect(noteFromKey('q', 4)).toBe(72);
    expect(noteFromKey('?', 4)).toBeNull();
  });

  it('supports cut, clear, volume, undo and redo', () => {
    let state = enterNote(newSession('gameboy'), 60);
    state = enterCut(state);
    expect(state.song.patterns[0].rows[1][0].cut).toBe(true);
    state = clearCell({ ...state, cursor: { ...state.cursor, row: 0 } });
    expect(state.song.patterns[0].rows[0][0].note).toBeNull();
    state = setVolume({ ...state, cursor: { ...state.cursor, row: 0 } }, 10);
    expect(state.song.patterns[0].rows[0][0].volume).toBe(10);
    const afterUndo = undo(state);
    expect(afterUndo.song).not.toBe(state.song);
    expect(redo(afterUndo).song.patterns[0].rows[0][0].volume).toBe(10);
    expect(undo(newSession('gameboy'))).toEqual(newSession('gameboy'));
    expect(redo(newSession('gameboy'))).toEqual(newSession('gameboy'));
  });

  it('moves the cursor and advances columns', () => {
    let state = newSession('gameboy');
    state = moveCursor(state, 1, 1, 1);
    expect(state.cursor.row).toBe(1);
    expect(state.cursor.channel).toBe(1);
    expect(state.cursor.column).toBe('instrument');
    state = advanceColumn(state, 'volume');
    expect(state.cursor.column).toBe('volume');
    state = moveCursor(state, 0, 0, -1);
    expect(state.cursor.column).toBe('instrument');
    state = moveCursor({ ...state, cursor: { ...state.cursor, column: 'note', channel: 0 } }, 0, 0, -1);
    expect(state.cursor.column).toBe('volume');
    state = moveCursor({ ...state, cursor: { ...state.cursor, column: 'volume', channel: 0 } }, 0, 0, 1);
    expect(state.cursor.column).toBe('note');
  });

  it('changes chip, name, tempo, octave, patterns and instruments', () => {
    let state = newSession('gameboy');
    expect(setChip(state, 'gameboy')).toBe(state);
    state = setChip(state, 'vectrex');
    expect(state.song.chip).toBe('vectrex');
    state = setName(state, 'x'.repeat(100));
    expect(state.song.name).toHaveLength(80);
    state = setTempo(state, 10);
    expect(state.song.tempo).toBe(40);
    state = setTempo(state, 300);
    expect(state.song.tempo).toBe(240);
    state = setOctave(state, 0);
    expect(state.octave).toBe(1);
    state = setOctave(state, 9);
    expect(state.octave).toBe(7);
    state = addPattern(state);
    expect(state.song.order).toHaveLength(2);
    expect(state.song.patterns[1].name).toBe('Pattern 2');
    expect(state.song.patterns[1].rows.flat().every((cell) => cell.note === null)).toBe(true);
    state = selectOrder(state, 0);
    expect(state.cursor.orderIndex).toBe(0);
    state = addInstrument(state);
    expect(state.song.instruments.length).toBeGreaterThan(1);
    const id = state.song.instruments[1].id;
    state = armInstrument(state, id);
    expect(state.song.armedInstrumentId).toBe(id);
    state = updateInstrument(state, id, { name: 'Lead' });
    expect(state.song.instruments.find((item) => item.id === id)?.name).toBe('Lead');
    const loaded = loadSong(state, newSong('gameboy'));
    expect(loaded.song.chip).toBe('gameboy');
    expect(loaded.past).toHaveLength(0);
  });

  it('duplicates, renames, clears, reorders and removes patterns', () => {
    let state = enterNote(newSession('gameboy'), 60);
    const firstId = state.song.patterns[0].id;
    state = duplicatePattern(state);
    expect(state.song.order).toHaveLength(2);
    expect(state.song.patterns[1].name).toBe('Pattern 1 (1)');
    expect(state.song.patterns[1].rows[0][0].note).toBe(60);
    expect(state.song.patterns[1].id).not.toBe(firstId);
    state = renamePattern(state, state.song.patterns[1].id, 'Verse');
    expect(state.song.patterns[1].name).toBe('Verse');
    state = duplicatePattern(state);
    expect(state.song.patterns.find((item) => item.id === state.song.order[state.cursor.orderIndex])?.name).toBe('Verse (1)');
    state = selectOrder(state, 0);
    state = clearPattern(state);
    expect(state.song.patterns[0].rows[0][0].note).toBeNull();
    expect(state.song.patterns[0].name).toBe('Pattern 1');
    const afterClear = undo(state);
    expect(afterClear.song.patterns[0].rows[0][0].note).toBe(60);
    state = reorderOrder(state, 0, 2);
    expect(state.song.order[2]).toBe(firstId);
    expect(state.cursor.orderIndex).toBe(2);
    state = removeOrderEntry(state);
    expect(state.song.order).toHaveLength(2);
    expect(state.song.patterns.some((item) => item.id === firstId)).toBe(false);
    const lone = newSession('gameboy');
    expect(removeOrderEntry(lone)).toBe(lone);
  });

  it('adds a random pattern without clearing the song', () => {
    let state = enterNote(newSession('gameboy'), 60);
    const kept = state.song.patterns[0].rows[0][0].note;
    state = addInstrument(state);
    const armed = state.song.armedInstrumentId;
    state = addRandomPattern(state, 11);
    expect(state.song.order).toHaveLength(2);
    expect(state.song.patterns[0].rows[0][0].note).toBe(kept);
    expect(state.song.patterns[1].name).toBe('Pattern 2');
    const notes = state.song.patterns[1].rows.flat().filter((cell) => cell.note !== null);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((cell) => cell.instrumentId === armed)).toBe(true);
    expect(nextBlankPatternName(state.song)).toBe('Pattern 3');
    expect(nextDuplicatePatternName(state.song, 'Pattern 2')).toBe('Pattern 2 (1)');
    expect(duplicateBaseName('Pattern 5 (1)')).toBe('Pattern 5');
    expect(patternDisplayName({ id: 'x', name: '', rows: [] }, 3)).toBe('Pattern 4');
    expect(renamePattern(state, state.song.patterns[0].id, '   ')).toBe(state);
    expect(renamePattern(state, state.song.patterns[1].id, 'Pattern 2')).toBe(state);
    expect(reorderOrder(state, 0, 0)).toBe(state);
    expect(reorderOrder(state, -1, 0)).toBe(state);
    state = selectOrder(state, 1);
    state = reorderOrder(state, 0, 1);
    expect(state.cursor.orderIndex).toBe(0);
    state = selectOrder(state, 0);
    state = reorderOrder(state, 1, 0);
    expect(state.cursor.orderIndex).toBe(1);
    const followed = followPlaybackOrder(state, 0, 5);
    expect(followed.cursor.orderIndex).toBe(0);
    expect(followed.cursor.row).toBe(5);
    expect(followPlaybackOrder(followed, 0, 5)).toBe(followed);
    state = duplicatePattern(selectOrder(addPattern(newSession('gameboy')), 0));
    state = duplicatePattern(state);
    expect(state.song.patterns.map((item) => item.name)).toEqual(['Pattern 1', 'Pattern 2', 'Pattern 1 (1)', 'Pattern 1 (2)']);
    const nameless = newSong('gameboy');
    nameless.patterns[0] = { ...nameless.patterns[0], name: undefined as unknown as string };
    const loaded = loadSong(newSession('gameboy'), nameless);
    expect(loaded.song.patterns[0].name).toBe('Pattern 1');
  });

  it('exposes chip definitions', () => {
    expect(chipIds()).toEqual(['gameboy', 'vectrex']);
    expect(chipDefinition('gameboy').channels).toHaveLength(4);
    expect(chipDefinition('vectrex').channels).toHaveLength(3);
  });

  it('toggles mute sets', () => {
    const song = newSong('gameboy');
    const muted = toggleMute(song, 1, new Set());
    expect(muted.has(1)).toBe(true);
    expect(toggleMute(song, 1, muted).has(1)).toBe(false);
  });
});
