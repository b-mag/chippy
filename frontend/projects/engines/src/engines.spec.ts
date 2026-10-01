import { describe, expect, it } from 'vitest';
import {
  addInstrument,
  addSnipInstrument,
  channelIsPlaceholder,
  chipDefinition,
  defaultFmPatch,
  enterCut,
  enterNote,
  newProject,
  newSession,
  randomSong,
  songForRender,
  updateInstrument,
} from '@chippy/domain';
import {
  ayPeriod,
  createFmSynthState,
  framesPerRow,
  isFmChipId,
  isFmRender,
  midiToHz,
  nesDutyFraction,
  nesTimer,
  renderSong,
  silentFmVoiceFrame,
  softFmVoiceFrame,
  softNesChannelFrame,
  synthesizeFmSamples,
} from '@chippy/engines';

describe('timing helpers', () => {
  it('computes hz and frames per row', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(framesPerRow(120, 50)).toBeGreaterThan(0);
    expect(framesPerRow(1, 50)).toBeGreaterThan(0);
    expect(ayPeriod(69, 2_000_000)).toBeGreaterThan(ayPeriod(69, 1_500_000));
    expect(nesTimer(60)).toBeGreaterThan(0);
    expect(nesDutyFraction(0)).toBe(0.125);
    expect(nesDutyFraction(2)).toBe(0.5);
  });
});

describe('soft NES helpers', () => {
  it('covers envelope rise, silence, decaying volume, and pitch macro', () => {
    const base = {
      duty: 2 as const,
      volume: 12,
      envelopeDown: true,
      envelopePeriod: 1,
      noiseShort: false,
      volumeMacro: null,
      pitchMacro: null,
      gateAge: 1,
    };
    expect(softNesChannelFrame({
      ...base,
      midi: null,
      active: true,
      wave: 'pulse',
    }).wave).toBe('none');
    const rising = softNesChannelFrame({
      ...base,
      midi: 60,
      active: true,
      wave: 'pulse',
      duty: 1,
      volume: 8,
      envelopeDown: false,
      gateAge: 5,
    });
    expect(rising.amp).toBeGreaterThan(8 / 15);
    const decayed = softNesChannelFrame({
      ...base,
      midi: 60,
      active: true,
      wave: 'pulse',
      volume: 2,
      gateAge: 40,
    });
    expect(decayed.wave).toBe('none');
    expect(softNesChannelFrame({
      ...base,
      midi: 60,
      active: true,
      wave: 'triangle',
      volume: 15,
      envelopePeriod: 0,
    }).wave).toBe('triangle');
    const kicked = softNesChannelFrame({
      ...base,
      midi: 36,
      active: true,
      wave: 'triangle',
      pitchMacro: [12, 8, 4, 0],
      gateAge: 1,
    });
    const settled = softNesChannelFrame({
      ...base,
      midi: 36,
      active: true,
      wave: 'triangle',
      pitchMacro: [12, 8, 4, 0],
      gateAge: 4,
    });
    expect(kicked.hz).toBeGreaterThan(settled.hz);
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

  it('renders Atari ST AY frames with 2 MHz periods', () => {
    const st = renderSong(songForRender(enterNote(newSession('atarist'), 69).project));
    const vx = renderSong(songForRender(enterNote(newSession('vectrex'), 69).project));
    expect(st.chip).toBe('atarist');
    expect(vx.chip).toBe('vectrex');
    if (st.chip !== 'atarist' || vx.chip !== 'vectrex') {
      return;
    }
    const stPeriod = st.frames[0][0] | ((st.frames[0][1] & 0x0f) << 8);
    const vxPeriod = vx.frames[0][0] | ((vx.frames[0][1] & 0x0f) << 8);
    expect(stPeriod).toBeGreaterThan(vxPeriod);
    expect(st.frames[0][8] & 0x0f).toBeGreaterThan(0);
  });

  it('renders soft NES pulse triangle and noise', () => {
    let state = newSession('nes');
    state = updateInstrument(state, state.project.armedInstrumentId, {
      envelopePeriod: 0,
      envelopeDown: false,
      envelopeStart: 12,
    });
    state = enterNote(state, 60);
    // Triangle channel should auto-create a triangle instrument on note entry.
    state = { ...state, cursor: { ...state.cursor, channel: 2, row: 0 } };
    state = enterNote(state, 48);
    state = { ...state, cursor: { ...state.cursor, channel: 3, row: 0 } };
    state = addInstrument(state, 'noise');
    state = updateInstrument(state, state.project.armedInstrumentId, {
      noiseShort: true,
      envelopePeriod: 1,
      envelopeDown: true,
      envelopeStart: 10,
    });
    state = enterNote(state, 40);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('nes');
    if (rendered.chip !== 'nes') {
      return;
    }
    expect(rendered.frames[0].channels[0].wave).toBe('pulse');
    expect(rendered.frames[0].channels[0].hz).toBeGreaterThan(0);
    expect(rendered.frames[0].channels[2].wave).toBe('triangle');
    expect(rendered.frames[0].channels[2].hz).toBeGreaterThan(0);
    expect(rendered.frames[0].channels[2].amp).toBeGreaterThanOrEqual(0.7);
    expect(rendered.frames[0].channels[3].wave).toBe('noise');
    expect(rendered.frames[0].channels[3].noiseShort).toBe(true);
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

describe('soft FM helpers', () => {
  const base = {
    patch: defaultFmPatch(),
    volume: 15,
    volumeMacro: null,
    pitchMacro: null,
    gateAge: 8,
    gated: true,
    frameRate: 60,
  };

  it('silences inactive, gateless, and zero-volume voices', () => {
    expect(softFmVoiceFrame({ ...base, midi: 60, active: false }).hz).toBe(0);
    expect(softFmVoiceFrame({ ...base, midi: null, active: true }).hz).toBe(0);
    expect(softFmVoiceFrame({ ...base, midi: 60, active: true, volume: 0 }).hz).toBe(0);
    expect(silentFmVoiceFrame().amp).toBe(0);
  });

  it('resolves pitch, operator levels, and LFO depth from the patch', () => {
    const voice = softFmVoiceFrame({ ...base, midi: 69, active: true });
    expect(voice.hz).toBeCloseTo(440, 3);
    expect(voice.amp).toBeCloseTo(1, 5);
    expect(voice.operators).toHaveLength(4);
    expect(voice.operators.some((operator) => operator.level > 0)).toBe(true);
    expect(voice.lfoHz).toBe(0);

    const lfo = softFmVoiceFrame({
      ...base,
      midi: 69,
      active: true,
      patch: { ...defaultFmPatch(), lfoEnable: true, lfoFrequency: 3, pms: 5, ams: 2 },
    });
    expect(lfo.lfoHz).toBeGreaterThan(0);
    expect(lfo.pitchDepth).toBeGreaterThan(0);
    expect(lfo.ampDepth).toBeGreaterThan(0);
  });

  it('follows macros and decays after the note is released', () => {
    const macro = softFmVoiceFrame({
      ...base,
      midi: 60,
      active: true,
      gateAge: 3,
      volumeMacro: [15, 15, 10],
      pitchMacro: [0, 0, 12],
    });
    expect(macro.hz).toBeCloseTo(midiToHz(72), 3);
    expect(macro.amp).toBeCloseTo(10 / 15, 5);

    const released = softFmVoiceFrame({ ...base, midi: 60, active: true, gated: false, gateAge: 2 });
    const later = softFmVoiceFrame({ ...base, midi: 60, active: true, gated: false, gateAge: 30 });
    const peak = (frame: ReturnType<typeof softFmVoiceFrame>) =>
      Math.max(...frame.operators.map((operator) => operator.level));
    expect(peak(later)).toBeLessThan(peak(released));
  });

  it('synthesizes audio and honours the audible filter', () => {
    const frames = Array.from({ length: 4 }, () => ({
      channels: [softFmVoiceFrame({ ...base, midi: 69, active: true })],
    }));
    const state = createFmSynthState(1, 44100);
    const samples = new Float32Array(4 * 735);
    synthesizeFmSamples(state, frames, 735, samples);
    expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(0);

    const muted = new Float32Array(4 * 735);
    synthesizeFmSamples(createFmSynthState(1, 44100), frames, 735, muted, () => false);
    expect(Math.max(...muted.map(Math.abs))).toBe(0);
  });
});

describe('FM song render', () => {
  it('identifies FM chips and renders every FM chip to audible frames', () => {
    expect(isFmChipId('genesis')).toBe(true);
    expect(isFmChipId('nes')).toBe(false);

    for (const chip of ['genesis', 'pc98', 'x68000'] as const) {
      const rendered = renderSong(randomSong(chip, 7));
      expect(isFmRender(rendered)).toBe(true);
      if (!isFmRender(rendered)) {
        continue;
      }
      const definition = chipDefinition(chip);
      expect(rendered.frames[0].channels).toHaveLength(definition.channels.length);
      const sounding = rendered.frames.some((frame) =>
        frame.channels.some((channel) => channel.hz > 0 && channel.amp > 0),
      );
      expect(sounding).toBe(true);

      // Placeholder channels have no legal instrument kind, so they stay silent.
      definition.channels.forEach((_, index) => {
        if (!channelIsPlaceholder(chip, index)) {
          return;
        }
        expect(rendered.frames.every((frame) => frame.channels[index].hz === 0)).toBe(true);
      });
    }
  });

  it('renders the same frames for the same seed', () => {
    const first = renderSong(randomSong('genesis', 11));
    const second = renderSong(randomSong('genesis', 11));
    expect(JSON.stringify(first.frames)).toBe(JSON.stringify(second.frames));
    const other = renderSong(randomSong('genesis', 12));
    expect(JSON.stringify(first.frames)).not.toBe(JSON.stringify(other.frames));
  });
});
