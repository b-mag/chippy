import { describe, expect, it } from 'vitest';
import {
  activeSongBody,
  addInstrument,
  addInstrumentFromPreset,
  addPattern,
  addRandomPattern,
  addSong,
  advanceColumn,
  armInstrument,
  auditionChannelId,
  auditionChannelIndex,
  changeInstrumentKind,
  clearCell,
  clearPattern,
  deleteInstrument,
  duplicateBaseName,
  duplicatePattern,
  enterCut,
  enterNote,
  followPlaybackOrder,
  loadProject,
  loadSong,
  markClean,
  moveCursor,
  newProject,
  newProjectForChip,
  newSession,
  nextBlankPatternName,
  nextDuplicatePatternName,
  noteFromKey,
  patternDisplayName,
  presetsForChip,
  redo,
  removeOrderEntry,
  removeSong,
  renameInstrument,
  renamePattern,
  reorderOrder,
  selectOrder,
  selectSong,
  setChip,
  setName,
  setOctave,
  setSongName,
  setTempo,
  setVolume,
  setEffect,
  songForRender,
  undo,
  updateInstrument,
  chipDefinition,
  chipIds,
  chipLabel,
  instrumentForChannel,
  kindAllowedOnChannel,
} from '@chippy/domain';
import { toggleMute } from './lib/session';

describe('session editing', () => {
  it('maps piano keys and ignores unknown keys', () => {
    expect(noteFromKey('z', 4)).toBe(60);
    expect(noteFromKey('q', 4)).toBe(72);
    expect(noteFromKey('?', 4)).toBeNull();
  });

  it('supports cut, clear, volume, effect, undo and redo', () => {
    let state = enterNote(newSession('gameboy'), 60);
    state = enterCut(state);
    expect(activeSongBody(state.project).patterns[0].rows[1][0].cut).toBe(true);
    state = clearCell({ ...state, cursor: { ...state.cursor, row: 0 } });
    expect(activeSongBody(state.project).patterns[0].rows[0][0].note).toBeNull();
    state = setVolume({ ...state, cursor: { ...state.cursor, row: 0 } }, 10);
    expect(activeSongBody(state.project).patterns[0].rows[0][0].volume).toBe(10);
    state = setEffect({ ...state, cursor: { ...state.cursor, row: 0 } }, { cmd: 'A', value: 3 });
    expect(activeSongBody(state.project).patterns[0].rows[0][0].effect).toEqual({ cmd: 'A', value: 3 });
    const afterUndo = undo(state);
    expect(afterUndo.project).not.toBe(state.project);
    expect(activeSongBody(redo(afterUndo).project).patterns[0].rows[0][0].volume).toBe(10);
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
    expect(state.cursor.column).toBe('effect');
    state = moveCursor({ ...state, cursor: { ...state.cursor, column: 'effect', channel: 0 } }, 0, 0, 1);
    expect(state.cursor.column).toBe('note');
    expect(state.cursor.channel).toBe(1);
  });

  it('wipes the project when the chip changes and edits name, tempo, songs, instruments', () => {
    let state = newSession('gameboy');
    expect(setChip(state, 'gameboy')).toBe(state);
    state = enterNote(state, 60);
    expect(state.dirty).toBe(true);
    state = setChip(state, 'vectrex');
    expect(state.project.chip).toBe('vectrex');
    expect(state.dirty).toBe(false);
    expect(activeSongBody(state.project).patterns[0].rows[0][0].note).toBeNull();
    state = setName(state, 'x'.repeat(100));
    expect(state.project.name).toHaveLength(80);
    state = setTempo(state, 10);
    expect(activeSongBody(state.project).tempo).toBe(40);
    state = setTempo(state, 400);
    expect(activeSongBody(state.project).tempo).toBe(240);
    state = setOctave(state, 9);
    expect(state.octave).toBe(7);
    state = addPattern(state);
    expect(activeSongBody(state.project).order).toHaveLength(2);
    expect(activeSongBody(state.project).patterns[1].name).toBe('Pattern 2');
    expect(activeSongBody(state.project).patterns[1].rows.flat().every((cell) => cell.note === null)).toBe(true);
    state = selectOrder(state, 0);
    state = followPlaybackOrder(state, 1, 3);
    expect(state.cursor.orderIndex).toBe(1);
    state = addInstrument(state);
    expect(state.project.instruments.length).toBeGreaterThan(1);
    const id = state.project.instruments[1].id;
    state = armInstrument(state, id);
    expect(state.project.armedInstrumentId).toBe(id);
    state = updateInstrument(state, id, { name: 'Lead' });
    expect(state.project.instruments.find((item) => item.id === id)?.name).toBe('Lead');
    const loaded = loadProject(state, newProject('gameboy'));
    expect(loaded.project.chip).toBe('gameboy');
    expect(loaded.dirty).toBe(false);
    expect(toggleMute(songForRender(loaded.project), 0, new Set()).has(0)).toBe(true);
  });

  it('duplicates, renames, clears, reorders and removes patterns', () => {
    let state = enterNote(newSession('gameboy'), 60);
    const firstId = activeSongBody(state.project).patterns[0].id;
    state = duplicatePattern(state);
    expect(activeSongBody(state.project).order).toHaveLength(2);
    expect(activeSongBody(state.project).patterns[1].name).toBe('Pattern 1 (1)');
    expect(activeSongBody(state.project).patterns[1].rows[0][0].note).toBe(60);
    expect(activeSongBody(state.project).patterns[1].id).not.toBe(firstId);
    state = renamePattern(state, activeSongBody(state.project).patterns[1].id, 'Verse');
    expect(activeSongBody(state.project).patterns[1].name).toBe('Verse');
    state = duplicatePattern(state);
    const body = activeSongBody(state.project);
    expect(body.patterns.find((item) => item.id === body.order[state.cursor.orderIndex])?.name).toBe('Verse (1)');
    state = selectOrder(state, 0);
    state = clearPattern(state);
    expect(activeSongBody(state.project).patterns[0].rows[0][0].note).toBeNull();
    expect(activeSongBody(state.project).patterns[0].name).toBe('Pattern 1');
    const afterClear = undo(state);
    expect(activeSongBody(afterClear.project).patterns[0].rows[0][0].note).toBe(60);
    state = reorderOrder(state, 0, 2);
    expect(activeSongBody(state.project).order[2]).toBe(firstId);
    state = selectOrder(state, 2);
    state = removeOrderEntry(state);
    expect(activeSongBody(state.project).order).toHaveLength(2);
    expect(activeSongBody(state.project).patterns.some((item) => item.id === firstId)).toBe(false);
    expect(removeOrderEntry(selectOrder({ ...state, cursor: { ...state.cursor, orderIndex: 0 } }, 0)).project).toBeDefined();
  });

  it('adds a random pattern without wiping earlier order entries', () => {
    let state = enterNote(newSession('gameboy'), 60);
    const kept = activeSongBody(state.project).patterns[0].rows[0][0].note;
    state = addRandomPattern(state, 42);
    expect(activeSongBody(state.project).order).toHaveLength(2);
    expect(activeSongBody(state.project).patterns[0].rows[0][0].note).toBe(kept);
    expect(activeSongBody(state.project).patterns[1].name).toBe('Pattern 2');
    const notes = activeSongBody(state.project).patterns[1].rows.flat().filter((cell) => cell.note !== null);
    expect(notes.length).toBeGreaterThan(0);
    expect(state.project.instruments.some((item) => item.kind === 'wave')).toBe(true);
    expect(state.project.instruments.some((item) => item.kind === 'noise')).toBe(true);
    const kinds = new Map(state.project.instruments.map((item) => [item.id, item.kind]));
    const pattern = activeSongBody(state.project).patterns[1];
    for (let channel = 0; channel < 4; channel += 1) {
      const allowed = chipDefinition('gameboy').kindsForChannel(
        chipDefinition('gameboy').channels[channel].id,
      );
      for (const row of pattern.rows) {
        const cell = row[channel];
        if (!cell.instrumentId) {
          continue;
        }
        expect(allowed).toContain(kinds.get(cell.instrumentId));
      }
    }
    expect(nextBlankPatternName(activeSongBody(state.project))).toBe('Pattern 3');
    expect(nextDuplicatePatternName(activeSongBody(state.project), 'Pattern 2')).toBe('Pattern 2 (1)');
    expect(duplicateBaseName('Verse (3)')).toBe('Verse');
    expect(patternDisplayName({ id: 'x', name: '', rows: [] }, 2)).toBe('Pattern 3');
    expect(renamePattern(state, activeSongBody(state.project).patterns[0].id, '   ')).toBe(state);
    expect(chipIds()).toContain('gameboy');
    expect(chipIds()).toContain('c64');
    expect(chipIds()).toContain('atarist');
    expect(chipIds()).toContain('nes');
    expect(chipDefinition('vectrex').channels).toHaveLength(3);
    expect(chipDefinition('atarist').clockHz).toBe(2_000_000);
    expect(chipDefinition('atarist').createInstrument('pulse').kind).toBe('tone');
    expect(chipDefinition('atarist').createInstrument('tone').kind).toBe('tone');
    expect(chipDefinition('nes').channels).toHaveLength(4);
    expect(chipDefinition('nes').kindsForChannel('triangle')).toEqual(['triangle']);
    expect(chipDefinition('nes').kindsForChannel('noise')).toEqual(['noise']);
    expect(chipDefinition('nes').createInstrument('triangle').kind).toBe('triangle');
    expect(chipDefinition('nes').createInstrument('sid').kind).toBe('pulse');
    expect(chipLabel('atarist')).toBe('Atari ST');
    expect(chipLabel('nes')).toBe('NES');
    expect(kindAllowedOnChannel('nes', 99, 'pulse')).toBe(false);
    expect(instrumentForChannel('nes', [], 'missing', 99)).toBeUndefined();
    expect(auditionChannelId('nes', 'triangle')).toBe('triangle');
    expect(chipDefinition('c64').createInstrument('pulse').kind).toBe('sid');
    expect(presetsForChip('c64').length).toBeGreaterThan(0);
    expect(presetsForChip('atarist').length).toBeGreaterThan(0);
    expect(presetsForChip('nes').length).toBeGreaterThan(0);
  });

  it('keeps Pattern N and duplicate suffixes stable across add and copy', () => {
    let state = newSession('gameboy');
    state = addPattern(state);
    state = selectOrder(state, 0);
    state = duplicatePattern(state);
    state = selectOrder(state, 0);
    state = duplicatePattern(state);
    expect(activeSongBody(state.project).patterns.map((item) => item.name)).toEqual([
      'Pattern 1', 'Pattern 2', 'Pattern 1 (1)', 'Pattern 1 (2)',
    ]);
    const nameless = newProject('gameboy');
    nameless.songs[0].patterns[0] = { ...nameless.songs[0].patterns[0], name: '' };
    const loaded = loadProject(newSession('gameboy'), nameless);
    expect(activeSongBody(loaded.project).patterns[0].name).toBe('Pattern 1');
    expect(loadSong(newSession('gameboy'), songForRender(newProject('vectrex'))).project.chip).toBe('vectrex');
  });

  it('manages songs and instrument kinds, delete, and presets', () => {
    let state = newSession('gameboy');
    state = addSong(state);
    expect(state.project.songs).toHaveLength(2);
    state = selectSong(state, state.project.songs[0].id);
    expect(state.project.activeSongId).toBe(state.project.songs[0].id);
    state = removeSong(state);
    expect(state.project.songs).toHaveLength(1);
    state = changeInstrumentKind(state, state.project.armedInstrumentId, 'wave');
    expect(state.project.instruments[0].kind).toBe('wave');
    state = renameInstrument(state, state.project.armedInstrumentId, ' Organ ');
    expect(state.project.instruments[0].name).toBe('Organ');
    state = { ...state, cursor: { ...state.cursor, channel: 3 } };
    state = addInstrument(state, 'noise');
    expect(state.project.instruments[1].kind).toBe('noise');
    const preset = presetsForChip('gameboy').find((item) => !item.premium)!;
    state = addInstrumentFromPreset(state, preset);
    expect(state.project.instruments.some((item) => item.name === preset.name)).toBe(true);
    const doomed = state.project.instruments[0].id;
    state = deleteInstrument(state, doomed);
    expect(state.project.instruments.some((item) => item.id === doomed)).toBe(false);
    expect(newProjectForChip(state, 'vectrex').project.chip).toBe('vectrex');
  });

  it('covers chip helpers and remaining instrument edges', () => {
    expect(chipDefinition('gameboy').createInstrument('tone').kind).toBe('pulse');
    expect(chipDefinition('vectrex').createInstrument('pulse').kind).toBe('tone');
    expect(chipDefinition('gameboy').kindsForChannel('wave')).toEqual(['wave']);
    expect(chipDefinition('gameboy').kindsForChannel('noise')).toEqual(['noise']);
    expect(auditionChannelId('gameboy', 'wave')).toBe('wave');
    expect(auditionChannelIndex('gameboy', 'noise')).toBe(3);
    let state = newSession('gameboy');
    state = changeInstrumentKind(state, state.project.armedInstrumentId, 'pulse');
    expect(state.project.instruments[0].kind).toBe('pulse');
    state = changeInstrumentKind(state, state.project.armedInstrumentId, 'snip' as never);
    expect(state.project.instruments[0].kind).toBe('pulse');
    expect(deleteInstrument(state, 'missing')).toBe(state);
    expect(deleteInstrument(state, state.project.armedInstrumentId)).toBe(state);
    state = addInstrument(state);
    const second = state.project.instruments[1].id;
    state = armInstrument(state, second);
    state = deleteInstrument(state, second);
    expect(state.project.armedInstrumentId).not.toBe(second);
    const foreign = presetsForChip('vectrex')[0];
    expect(addInstrumentFromPreset(state, foreign)).toBe(state);
    expect(removeSong(state)).toBe(state);
    expect(selectSong(state, 'nope')).toBe(state);
    state = setSongName(state, '  Hook  ');
    expect(activeSongBody(state.project).name).toBe('Hook');
    expect(setSongName(state, '   ')).toBe(state);
    expect(renameInstrument(state, state.project.armedInstrumentId, '  ')).toBe(state);
    expect(markClean({ ...state, dirty: true }).dirty).toBe(false);
  });
});
