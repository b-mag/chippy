import { describe, expect, it } from 'vitest';
import {
  addSnipInstrument,
  enterNote,
  newProject,
  newSession,
  songForRender,
  updateInstrument,
} from '@chippy/domain';
import { framesPerRow, midiToHz, renderSong } from '@chippy/engines';

describe('timing helpers', () => {
  it('computes hz and frames per row', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(framesPerRow(120, 50)).toBeGreaterThan(0);
    expect(framesPerRow(1, 50)).toBeGreaterThan(0);
  });
});

describe('renderSong', () => {
  it('replays a snip instrument on Vectrex', () => {
    const base = newProject('vectrex');
    const frames = [new Array(16).fill(0)];
    frames[0][0] = 100;
    frames[0][1] = 0;
    frames[0][8] = 14;
    const { project, instrumentId } = addSnipInstrument(base, 'Kick', frames);
    let state = { ...newSession('vectrex'), project };
    state = updateInstrument(state, instrumentId, {});
    state = {
      ...state,
      project: { ...state.project, armedInstrumentId: instrumentId },
    };
    state = enterNote(state, 60);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('vectrex');
    if (rendered.chip !== 'vectrex') {
      return;
    }
    expect(rendered.frames[0][0]).toBe(100);
    expect(rendered.frames[0][8]).toBe(14);
  });

  it('renders pulse, wave and noise on Game Boy', () => {
    let state = newSession('gameboy');
    state = enterNote(state, 60);
    state = {
      ...state,
      cursor: { ...state.cursor, channel: 2, row: 0 },
    };
    state = enterNote(state, 64);
    state = {
      ...state,
      cursor: { ...state.cursor, channel: 3, row: 0 },
    };
    state = enterNote(state, 40);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('gameboy');
    if (rendered.chip !== 'gameboy') {
      return;
    }
    expect(rendered.frames[0].nr14 & 0x80).toBe(0x80);
    expect(rendered.frames[0].nr30).toBe(0x80);
    expect(rendered.frames[0].nr44).toBe(0x80);
  });

  it('applies vectrex noise mix, hardware envelope, and gb envelope rise', () => {
    let state = newSession('vectrex');
    const id = state.project.armedInstrumentId;
    state = updateInstrument(state, id, { mixNoise: true, hardwareEnvelope: true, envelopeStart: 10 });
    state = enterNote(state, 69);
    const ay = renderSong(songForRender(state.project));
    expect(ay.chip).toBe('vectrex');
    if (ay.chip === 'vectrex') {
      expect(ay.frames[0][8] & 0x10).toBe(0x10);
      expect(ay.frames[0][7] & 0x08).toBe(0);
    }
    let gb = newSession('gameboy');
    gb = updateInstrument(gb, gb.project.armedInstrumentId, { envelopeDown: false, sweepTime: 2, sweepShift: 1, sweepDown: false });
    gb = enterNote(gb, 60);
    const pulse2 = { ...gb, cursor: { ...gb.cursor, channel: 1, row: 1 } };
    const withSecond = enterNote(pulse2, 62);
    const rendered = renderSong(songForRender(withSecond.project));
    expect(rendered.chip).toBe('gameboy');
  });
});
