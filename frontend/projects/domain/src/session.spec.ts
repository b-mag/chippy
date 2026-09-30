import { describe, expect, it } from 'vitest';
import {
  addInstrument,
  addPattern,
  advanceColumn,
  armInstrument,
  clearCell,
  enterCut,
  enterNote,
  loadSong,
  moveCursor,
  newSession,
  newSong,
  noteFromKey,
  redo,
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
