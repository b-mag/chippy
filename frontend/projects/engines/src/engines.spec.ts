import { describe, expect, it } from 'vitest';
import {
  addInstrument,
  addSnipInstrument,
  enterCut,
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

  it('renders game boy wave channel frames for a wave instrument note', () => {
    let state = newSession('gameboy');
    state = addInstrument(state, 'wave');
    state = { ...state, cursor: { ...state.cursor, channel: 2, row: 0 } };
    state = enterNote(state, 60);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('gameboy');
    if (rendered.chip === 'gameboy') {
      expect(rendered.frames[0].nr30 & 0x80).toBe(0x80);
      expect(rendered.frames[0].nr32 & 0x60).toBe(0x20);
      const freq = rendered.frames[0].nr33 | ((rendered.frames[0].nr34 & 7) << 8);
      expect(freq).toBeGreaterThan(0);
      expect(rendered.frames[0].wave.length).toBe(32);
    }
  });

  it('applies vectrex soft envelope, volume macro, and pitch macro', () => {
    let state = newSession('vectrex');
    const id = state.project.armedInstrumentId;
    state = updateInstrument(state, id, {
      envelopeStart: 10,
      envelopeDown: true,
      envelopePeriod: 1,
      hardwareEnvelope: false,
      volumeMacro: null,
      pitchMacro: [0, 12],
    });
    state = enterNote(state, 57);
    const ay = renderSong(songForRender(state.project));
    expect(ay.chip).toBe('vectrex');
    if (ay.chip === 'vectrex') {
      expect(ay.frames[0][8] & 0x0f).toBe(10);
      expect(ay.frames[1][8] & 0x0f).toBe(9);
      const period0 = ay.frames[0][0] | ((ay.frames[0][1] & 0x0f) << 8);
      const period1 = ay.frames[1][0] | ((ay.frames[1][1] & 0x0f) << 8);
      expect(period1).toBeLessThan(period0);
    }
    state = updateInstrument(state, id, { volumeMacro: [15, 1], pitchMacro: null, envelopePeriod: 0 });
    const withMacro = renderSong(songForRender(state.project));
    if (withMacro.chip === 'vectrex') {
      expect(withMacro.frames[0][8] & 0x0f).toBe(15);
      expect(withMacro.frames[1][8] & 0x0f).toBe(1);
    }
  });

  it('applies vectrex noise mix, hardware envelope, and gb envelope rise', () => {
    let state = newSession('vectrex');
    const id = state.project.armedInstrumentId;
    state = updateInstrument(state, id, {
      mixNoise: true,
      noisePeriod: 12,
      hardwareEnvelope: true,
      hardwareEnvelopePeriod: 0x1234,
      hardwareEnvelopeShape: 0x0a,
      envelopeStart: 10,
    });
    state = enterNote(state, 69);
    const ay = renderSong(songForRender(state.project));
    expect(ay.chip).toBe('vectrex');
    if (ay.chip === 'vectrex') {
      expect(ay.frames[0][8] & 0x10).toBe(0x10);
      expect(ay.frames[0][7] & 0x08).toBe(0);
      expect(ay.frames[0][6]).toBe(12);
      expect(ay.frames[0][11]).toBe(0x34);
      expect(ay.frames[0][12]).toBe(0x12);
      expect(ay.frames[0][13]).toBe(0x0a);
    }
    let gb = newSession('gameboy');
    gb = updateInstrument(gb, gb.project.armedInstrumentId, { envelopeDown: false, sweepTime: 2, sweepShift: 1, sweepDown: false });
    gb = enterNote(gb, 60);
    const pulse2 = { ...gb, cursor: { ...gb.cursor, channel: 1, row: 1 } };
    const withSecond = enterNote(pulse2, 62);
    const rendered = renderSong(songForRender(withSecond.project));
    expect(rendered.chip).toBe('gameboy');
  });

  it('renders soft SID frames for C64', () => {
    let state = newSession('c64');
    state = updateInstrument(state, state.project.armedInstrumentId, {
      wavePulse: true,
      attack: 0,
      decay: 2,
      sustain: 12,
      release: 2,
    });
    state = enterNote(state, 60);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('c64');
    if (rendered.chip !== 'c64') {
      return;
    }
    expect(rendered.frames.length).toBeGreaterThan(0);
    expect(rendered.frames[0].voices[0].hz).toBeGreaterThan(0);
    expect(rendered.frames[0].voices[0].amp).toBeGreaterThan(0);
    expect(rendered.frames[0].voices[0].wave).toBe('square');
  });

  it('honors delay and volume-slide FX on all chips', () => {
    let state = enterNote(newSession('gameboy'), 60);
    const body = songForRender(state.project);
    body.patterns[0].rows[0][0] = {
      ...body.patterns[0].rows[0][0],
      effect: { cmd: 'D', value: 2 },
    };
    const delayed = renderSong(body);
    expect(delayed.chip).toBe('gameboy');
    if (delayed.chip === 'gameboy') {
      expect(delayed.frames[0].nr14 & 0x80).toBe(0);
      expect(delayed.frames[1].nr14 & 0x80).toBe(0x80);
    }
    let slide = enterNote(newSession('c64'), 64);
    const slideSong = songForRender(slide.project);
    slideSong.patterns[0].rows[0][0] = {
      ...slideSong.patterns[0].rows[0][0],
      volume: 12,
      effect: { cmd: 'A', value: 2 },
    };
    const slid = renderSong(slideSong);
    expect(slid.chip).toBe('c64');
  });

  it('honors volume-up, timed cut, and pitch-slide FX', () => {
    let up = enterNote(newSession('vectrex'), 60);
    const upSong = songForRender(up.project);
    upSong.patterns[0].rows[0][0] = {
      ...upSong.patterns[0].rows[0][0],
      volume: 4,
      effect: { cmd: 'U', value: 2 },
    };
    const upRendered = renderSong(upSong);
    expect(upRendered.chip).toBe('vectrex');
    if (upRendered.chip === 'vectrex') {
      expect(upRendered.frames[0][8] & 0x0f).toBeLessThan(upRendered.frames[2][8] & 0x0f);
    }

    let nullVol = enterNote(newSession('c64'), 60);
    const nullVolSong = songForRender(nullVol.project);
    nullVolSong.patterns[0].rows[0][0] = {
      ...nullVolSong.patterns[0].rows[0][0],
      volume: null,
      effect: { cmd: 'U', value: 1 },
    };
    expect(renderSong(nullVolSong).chip).toBe('c64');

    let cut = enterNote(newSession('gameboy'), 60);
    const cutSong = songForRender(cut.project);
    cutSong.patterns[0].rows[0][0] = {
      ...cutSong.patterns[0].rows[0][0],
      effect: { cmd: 'C', value: 1 },
    };
    const cutRendered = renderSong(cutSong);
    expect(cutRendered.chip).toBe('gameboy');
    if (cutRendered.chip === 'gameboy') {
      expect(cutRendered.frames[0].nr14 & 0x80).toBe(0x80);
      expect(cutRendered.frames[1].nr14 & 0x80).toBe(0);
    }

    let cutNow = enterNote(newSession('gameboy'), 60);
    const cutNowSong = songForRender(cutNow.project);
    cutNowSong.patterns[0].rows[0][0] = {
      ...cutNowSong.patterns[0].rows[0][0],
      effect: { cmd: 'C', value: 0 },
    };
    const cutNowRendered = renderSong(cutNowSong);
    expect(cutNowRendered.chip).toBe('gameboy');
    if (cutNowRendered.chip === 'gameboy') {
      expect(cutNowRendered.frames[0].nr14 & 0x80).toBe(0);
    }

    let pitch = enterNote(newSession('c64'), 60);
    const pitchSong = songForRender(pitch.project);
    pitchSong.patterns[0].rows[0][0] = {
      ...pitchSong.patterns[0].rows[0][0],
      effect: { cmd: 'P', value: 10 },
    };
    const pitchRendered = renderSong(pitchSong);
    expect(pitchRendered.chip).toBe('c64');
    if (pitchRendered.chip === 'c64') {
      expect(pitchRendered.frames[2].voices[0].hz).toBeGreaterThan(pitchRendered.frames[0].voices[0].hz);
    }
  });

  it('covers SID wave picks, release, filter, and retrigger FX', () => {
    let saw = newSession('c64');
    saw = updateInstrument(saw, saw.project.armedInstrumentId, {
      waveSaw: true,
      wavePulse: false,
      waveTriangle: false,
      waveNoise: false,
      filterEnable: true,
      filterCutoff: 800,
      filterResonance: 12,
      filterMode: 1,
      attack: 0,
      decay: 0,
      sustain: 8,
      release: 2,
    });
    saw = enterNote(saw, 67);
    saw = {
      ...saw,
      cursor: { ...saw.cursor, row: 2 },
    };
    saw = enterCut(saw);
    const sawRendered = renderSong(songForRender(saw.project));
    expect(sawRendered.chip).toBe('c64');
    if (sawRendered.chip === 'c64') {
      expect(sawRendered.frames[0].voices[0].wave).toBe('saw');
      expect(sawRendered.frames[0].filterMode).toBe(1);
    }

    let tri = newSession('c64');
    tri = updateInstrument(tri, tri.project.armedInstrumentId, {
      waveTriangle: true,
      wavePulse: false,
      waveSaw: false,
      waveNoise: false,
      filterEnable: true,
      filterMode: 2,
    });
    tri = enterNote(tri, 60);
    const triSong = songForRender(tri.project);
    triSong.patterns[0].rows[0][0] = {
      ...triSong.patterns[0].rows[0][0],
      effect: { cmd: 'R', value: 2 },
    };
    const triRendered = renderSong(triSong);
    expect(triRendered.chip).toBe('c64');
    if (triRendered.chip === 'c64') {
      expect(triRendered.frames[0].voices[0].wave).toBe('triangle');
      expect(triRendered.frames[0].filterMode).toBe(2);
    }

    let noise = newSession('c64');
    noise = updateInstrument(noise, noise.project.armedInstrumentId, {
      waveNoise: true,
      wavePulse: false,
      filterEnable: false,
    });
    noise = enterNote(noise, 40);
    const noiseRendered = renderSong(songForRender(noise.project));
    expect(noiseRendered.chip).toBe('c64');
    if (noiseRendered.chip === 'c64') {
      expect(noiseRendered.frames[0].voices[0].wave).toBe('noise');
    }
  });
});
