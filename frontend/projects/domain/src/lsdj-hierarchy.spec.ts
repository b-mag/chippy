import { describe, expect, it } from 'vitest';
import {
  addHierarchyTable,
  blankLsdjTable,
  canExpandFlatToHierarchy,
  channelFlatSlots,
  chainAt,
  clearPhrase,
  derivedOrderEntries,
  expandFlatToHierarchy,
  findChain,
  findPhrase,
  flatCellTarget,
  focusedChainIndex,
  focusedPhraseIndex,
  isLsdjMode,
  lsdjHex,
  nextFreeChainIndex,
  nextFreePhraseIndex,
  parseLsdjHex,
  phraseUseCounts,
  setChainStep,
  setHierarchyFocus,
  setLsdjEnabled,
  setSequenceCell,
  songRowCount,
  syncFlatProjection,
  writeFlatCell,
  writePhraseStep,
} from './lib/lsdj-hierarchy';
import { blankPattern, blankSongBody } from './lib/song-factory';
import {
  addChainAt,
  addPhraseAt,
  addRandomPattern,
  addTable,
  enableLsdjMode,
  disableLsdjMode,
  enterNote,
  lsdjModeAvailability,
  newSession,
  removeOrderEntry,
  selectChainStep,
  selectOrder,
  selectSongCell,
  toggleLsdjMode,
  writeChainStep,
  writeGroove,
  writeSongCell,
  writeTable,
} from './lib/session';
import { songForRender } from './lib/song-factory';

function noteCell(note: number) {
  return { note, cut: false, instrumentId: 'ins-1', volume: null, effect: null };
}

describe('lsdj hierarchy', () => {
  it('formats and parses LSDJ hex slot numbers', () => {
    expect(lsdjHex(0)).toBe('00');
    expect(lsdjHex(255)).toBe('FF');
    expect(lsdjHex(5, 1)).toBe('5');
    expect(parseLsdjHex('7f')).toBe(0x7f);
    expect(parseLsdjHex('')).toBeNull();
    expect(parseLsdjHex('zz')).toBeNull();
  });

  it('expands a flat song into single-channel phrases packed into chains', () => {
    const flat = blankSongBody('song-1', 'Song 1', 4);
    const pattern = blankPattern('pat-1', 'Pattern 1', 4);
    pattern.rows[0][0] = noteCell(60);
    pattern.rows[4][1] = noteCell(48);
    flat.patterns = [pattern];
    flat.order = ['pat-1', 'pat-1'];

    expect(canExpandFlatToHierarchy(flat, 4)).toEqual({ ok: true });
    const expanded = expandFlatToHierarchy(flat, 4);
    expect(isLsdjMode(expanded)).toBe(true);

    const hierarchy = expanded.lsdj!;
    // Each channel column becomes its own phrase; identical repeats are deduplicated.
    expect(hierarchy.phrases.every((phrase) => phrase.steps.length === 16)).toBe(true);
    expect(findPhrase(hierarchy, 0)?.steps[0].note).toBe(60);
    expect(chainAt(hierarchy, 0, 0)).toBe(0);
    // Channels 2 and 3 are silent, so they get no chains at all.
    expect(chainAt(hierarchy, 2, 0)).toBeNull();

    // The repeated order slot reuses one phrase rather than duplicating it.
    const slots = channelFlatSlots(hierarchy);
    expect(slots[0][0].phrase).toBe(slots[0][1].phrase);
    expect(phraseUseCounts(hierarchy).get(slots[0][0].phrase)).toBe(2);
  });

  it('projects the hierarchy back into a flat 4-channel grid with transpose applied', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    body = writePhraseStep(body, 0, 0, noteCell(60));
    const chain = findChain(body.lsdj!, 0)!;
    body = setChainStep(body, chain.index, 0, { phrase: 0, transpose: 12 });
    body = setSequenceCell(body, 0, 0, chain.index);

    const projected = syncFlatProjection(body);
    expect(projected.patterns[0].rows[0][0].note).toBe(72);
    // The stored phrase keeps its own pitch; transpose lives on the chain step.
    expect(findPhrase(projected.lsdj!, 0)?.steps[0].note).toBe(60);

    // Editing the flat projection writes back through the transpose.
    const edited = writeFlatCell(projected, 0, 0, 1, noteCell(74));
    expect(findPhrase(edited.lsdj!, 0)?.steps[1].note).toBe(62);
    expect(flatCellTarget(edited.lsdj!, 0, 0)).toEqual({ phrase: 0, transpose: 12 });
    expect(flatCellTarget(edited.lsdj!, 99, 0)).toBeNull();
  });

  it('cascades Song selection to the Chain and Phrase screens', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    body = setSequenceCell(body, 1, 3, 9);
    body = setChainStep(body, 9, 2, { phrase: 40 });
    body = setHierarchyFocus(body, { songRow: 3, chainStep: 2 });

    expect(focusedChainIndex(body.lsdj!, 1)).toBe(9);
    expect(focusedPhraseIndex(body.lsdj!, 1)).toBe(40);
    // A different channel at the same row has no chain, so nothing is focused.
    expect(focusedChainIndex(body.lsdj!, 2)).toBeNull();
    expect(focusedPhraseIndex(body.lsdj!, 2)).toBeNull();
  });

  it('grows the Song screen as rows fill and reports free slots', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    const base = songRowCount(body.lsdj!);
    body = setSequenceCell(body, 0, 10, 5);
    expect(songRowCount(body.lsdj!)).toBe(12);
    expect(songRowCount(body.lsdj!)).toBeGreaterThan(base);
    expect(nextFreeChainIndex(body.lsdj!)).not.toBeNull();
    expect(nextFreePhraseIndex(body.lsdj!)).not.toBeNull();
  });

  it('rejects out-of-range slot writes and clears cells', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    expect(setSequenceCell(body, 0, 0, 999)).toBe(body);
    expect(setSequenceCell(body, 9, 0, 1)).toBe(body);
    expect(setChainStep(body, 0, 99, { phrase: 1 })).toBe(body);
    expect(setChainStep(body, 0, 0, { phrase: 999 })).toBe(body);
    body = setSequenceCell(body, 0, 0, null);
    expect(chainAt(body.lsdj!, 0, 0)).toBeNull();
  });

  it('clears a phrase without unlinking it from its chains', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    body = writePhraseStep(body, 0, 0, noteCell(60));
    body = clearPhrase(body, 0);
    expect(findPhrase(body.lsdj!, 0)?.steps[0].note).toBeNull();
  });

  it('updates grooves and tables by slot index', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    body = addHierarchyTable(body);
    expect(body.lsdj!.tables.length).toBe(2);
    expect(body.lsdj!.tables[1].index).toBe(1);
    const extra = blankLsdjTable(9);
    extra.steps[0].envelope = 0xaa;
    body = { ...body, lsdj: { ...body.lsdj!, tables: [...body.lsdj!.tables, extra] } };
    expect(body.lsdj!.tables.some((table) => table.index === 9)).toBe(true);
  });

  it('keeps the hierarchy when LSDJ mode is switched off', () => {
    const body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    const off = setLsdjEnabled(body, false);
    expect(off.lsdj?.enabled).toBe(false);
    expect(off.lsdj?.chains).toEqual(body.lsdj?.chains);
    expect(isLsdjMode(off)).toBe(false);
    // Re-entering never rebuilds: the same hierarchy comes back.
    expect(expandFlatToHierarchy(off, 4).lsdj?.phrases).toEqual(body.lsdj?.phrases);
  });

  it('reports derived order entries for the flat rail', () => {
    let body = expandFlatToHierarchy(blankSongBody('song-1', 'Song 1', 4), 4);
    body = setChainStep(body, 0, 0, { phrase: 0 });
    body = setChainStep(body, 0, 1, { phrase: 0 });
    const entries = derivedOrderEntries(body.lsdj!);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].shared).toBe(true);
    expect(entries[0].phrases).toContain(0);
  });
});

describe('lsdj mode session commands', () => {
  it('toggles LSDJ mode on Game Boy only', () => {
    let state = newSession('gameboy');
    expect(state.project.songs[0].lsdj).toBeNull();
    expect(lsdjModeAvailability(state)).toEqual({ ok: true });

    state = toggleLsdjMode(state);
    expect(state.project.songs[0].lsdj?.enabled).toBe(true);
    state = toggleLsdjMode(state);
    expect(state.project.songs[0].lsdj?.enabled).toBe(false);
    state = enableLsdjMode(state);
    expect(state.project.songs[0].lsdj?.enabled).toBe(true);
    state = disableLsdjMode(state);
    expect(state.project.songs[0].lsdj?.enabled).toBe(false);

    const other = newSession('vectrex');
    expect(lsdjModeAvailability(other).ok).toBe(false);
    expect(enableLsdjMode(other).project.songs[0].lsdj).toBeNull();
  });

  it('edits the Song, Chain, and Phrase screens through the cursor cascade', () => {
    let state = enableLsdjMode(newSession('gameboy'));

    state = writeSongCell(state, 1, 2, 0x0a);
    state = selectSongCell(state, 1, 2);
    expect(state.cursor.channel).toBe(1);
    expect(state.project.songs[0].lsdj!.focus.songRow).toBe(2);
    expect(chainAt(state.project.songs[0].lsdj!, 1, 2)).toBe(0x0a);

    state = addPhraseAt(state, 0x0a, 0);
    const phrase = focusedPhraseIndex(state.project.songs[0].lsdj!, 1);
    expect(phrase).not.toBeNull();

    state = selectChainStep(state, 0);
    state = writeChainStep(state, 0x0a, 0, { transpose: -3 });
    expect(findChain(state.project.songs[0].lsdj!, 0x0a)?.steps[0].transpose).toBe(-3);

    // Note entry lands on the focused phrase, not on a derived flat pattern.
    state = { ...state, cursor: { ...state.cursor, row: 1, column: 'note' } };
    state = enterNote(state, 64);
    expect(findPhrase(state.project.songs[0].lsdj!, phrase!)?.steps[1].note).toBe(64);
  });

  it('allocates a new chain when an empty Song cell is picked', () => {
    let state = enableLsdjMode(newSession('gameboy'));
    state = addChainAt(state, 3, 5);
    expect(chainAt(state.project.songs[0].lsdj!, 3, 5)).not.toBeNull();
    expect(state.project.songs[0].lsdj!.focus.songRow).toBe(5);
  });

  it('writes grooves and tables in LSDJ mode', () => {
    let state = enableLsdjMode(newSession('gameboy'));
    state = writeGroove(state, 0, [4, 8]);
    expect(state.project.songs[0].lsdj!.grooves[0][0]).toBe(4);

    const table = state.project.songs[0].lsdj!.tables[0];
    state = writeTable(state, {
      ...table,
      steps: table.steps.map((step, index) => (index === 0 ? { ...step, envelope: 0xaa } : step)),
    });
    expect(state.project.songs[0].lsdj!.tables[0].steps[0].envelope).toBe(0xaa);
    state = addTable(state);
    expect(state.project.songs[0].lsdj!.tables.length).toBeGreaterThan(1);
  });

  it('writes flat-grid edits onto the shared phrase when LSDJ mode is off', () => {
    let state = disableLsdjMode(enableLsdjMode(newSession('gameboy')));
    state = { ...state, cursor: { orderIndex: 0, row: 2, channel: 0, column: 'note' } };
    state = enterNote(state, 55);
    const target = flatCellTarget(state.project.songs[0].lsdj!, 0, 0);
    expect(target).not.toBeNull();
    expect(findPhrase(state.project.songs[0].lsdj!, target!.phrase)?.steps[2].note).toBe(55);
  });

  it('keeps a flat random pattern audible after leaving LSDJ mode', () => {
    let state = disableLsdjMode(enableLsdjMode(newSession('gameboy')));
    state = addRandomPattern(state, 42);
    state = selectOrder(state, 0);
    state = removeOrderEntry(state);
    // Play uses songForRender, which rebuilds from the hierarchy — that projection
    // must carry the random notes, not only the stale UI-side pattern list.
    const song = songForRender(state.project);
    const notes = song.patterns.flatMap((pattern) => pattern.rows.flat()).filter((cell) => cell.note !== null);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((cell) => cell.volume !== null && cell.volume > 0)).toBe(true);
  });
});
