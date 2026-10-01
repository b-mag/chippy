import { chipDefinition, type Cell, type CellEffect, type Instrument, type Song } from '@chippy/domain';
import { emptySidFrame, softSidVoiceFrame, type SidFrame, type SoftSidVoiceParams } from './soft-sid';
import { ayPeriod, framesPerRow, gbFrequency } from './timing';

/** Sixteen YM registers. Indexes 14 and 15 are unused padding, matching YM6. */
export type AyFrame = number[];

export interface GbFrame {
  nr10: number;
  nr11: number;
  nr12: number;
  nr13: number;
  nr14: number;
  nr21: number;
  nr22: number;
  nr23: number;
  nr24: number;
  nr30: number;
  nr32: number;
  nr33: number;
  nr34: number;
  nr42: number;
  nr43: number;
  nr44: number;
  wave: number[];
}

export type { SidFrame };

export type RenderedSong =
  | { chip: 'vectrex'; frameRate: number; framesPerRow: number; frames: AyFrame[] }
  | { chip: 'gameboy'; frameRate: number; framesPerRow: number; frames: GbFrame[] }
  | { chip: 'c64'; frameRate: number; framesPerRow: number; frames: SidFrame[] };

/** Four built-in 32-sample waveforms. Values are 4-bit, 0 through 15. */
export const WAVEFORMS: number[][] = [
  Array.from({ length: 32 }, (_, index) => (index < 16 ? 15 : 0)),
  Array.from({ length: 32 }, (_, index) => Math.min(15, Math.floor(index / 2))),
  Array.from({ length: 32 }, (_, index) => (index < 16 ? index : 31 - index)),
  Array.from({ length: 32 }, (_, index) => (index % 8 < 4 ? 12 : 4)),
];

interface Voice {
  note: number | null;
  instrumentId: string | null;
  volume: number | null;
  snipIndex: number;
  active: boolean;
  /** Pending note when effect D delays onset. */
  pendingNote: number | null;
  pendingInstrumentId: string | null;
  pendingVolume: number | null;
  delayFramesLeft: number;
  volumeSlide: number;
  retriggerPeriod: number;
  retriggerAge: number;
  gateAge: number;
  gated: boolean;
}

function instrumentOf(song: Song, id: string | null): Instrument | undefined {
  return song.instruments.find((item) => item.id === id);
}

function silentVoices(count: number): Voice[] {
  return Array.from({ length: count }, () => ({
    note: null,
    instrumentId: null,
    volume: null,
    snipIndex: 0,
    active: false,
    pendingNote: null,
    pendingInstrumentId: null,
    pendingVolume: null,
    delayFramesLeft: 0,
    volumeSlide: 0,
    retriggerPeriod: 0,
    retriggerAge: 0,
    gateAge: 0,
    gated: false,
  }));
}

function dominantTone(frame: number[]): { period: number; volume: number } {
  let best = { period: 0, volume: 0 };
  for (let channel = 0; channel < 3; channel += 1) {
    const volume = frame[8 + channel] & 0x0f;
    const period = (frame[channel * 2] ?? 0) | ((frame[channel * 2 + 1] & 0x0f) << 8);
    if (volume > best.volume && period > 0) {
      best = { period, volume };
    }
  }
  return best;
}

function applyEffect(voice: Voice, effect: CellEffect | null): void {
  voice.volumeSlide = 0;
  voice.retriggerPeriod = 0;
  if (!effect) {
    return;
  }
  if (effect.cmd === 'A') {
    voice.volumeSlide = -(effect.value & 0x0f);
  } else if (effect.cmd === 'R') {
    voice.retriggerPeriod = Math.max(1, effect.value & 0x0f);
    voice.retriggerAge = 0;
  }
}

function triggerNote(
  voice: Voice,
  note: number,
  instrumentId: string | null,
  volume: number | null,
): void {
  voice.active = true;
  voice.note = note;
  voice.instrumentId = instrumentId;
  voice.volume = volume;
  voice.snipIndex = 0;
  voice.gateAge = 0;
  voice.gated = true;
}

function applyRow(voices: Voice[], row: Cell[]): void {
  voices.forEach((voice, index) => {
    const cell = row[index];
    if (!cell) {
      return;
    }
    applyEffect(voice, cell.effect ?? null);
    if (cell.cut) {
      voice.active = false;
      voice.note = null;
      voice.pendingNote = null;
      voice.delayFramesLeft = 0;
      voice.gated = false;
      voice.gateAge = 0;
      return;
    }
    if (cell.note !== null) {
      const delay = cell.effect?.cmd === 'D' ? cell.effect.value & 0x0f : 0;
      if (delay > 0) {
        voice.pendingNote = cell.note;
        voice.pendingInstrumentId = cell.instrumentId;
        voice.pendingVolume = cell.volume;
        voice.delayFramesLeft = delay;
      } else {
        triggerNote(voice, cell.note, cell.instrumentId, cell.volume);
      }
    } else if (cell.volume !== null) {
      voice.volume = cell.volume;
    }
  });
}

function tickVoiceFx(voice: Voice): void {
  if (voice.delayFramesLeft > 0) {
    voice.delayFramesLeft -= 1;
    if (voice.delayFramesLeft === 0 && voice.pendingNote !== null) {
      triggerNote(voice, voice.pendingNote, voice.pendingInstrumentId, voice.pendingVolume);
      voice.pendingNote = null;
    }
  }
  if (voice.volumeSlide !== 0 && voice.volume !== null) {
    voice.volume = Math.min(15, Math.max(0, voice.volume + voice.volumeSlide));
  } else if (voice.volumeSlide !== 0 && voice.volume === null && voice.active) {
    voice.volume = Math.min(15, Math.max(0, 12 + voice.volumeSlide));
  }
  if (voice.retriggerPeriod > 0 && voice.active && voice.note !== null) {
    voice.retriggerAge += 1;
    if (voice.retriggerAge >= voice.retriggerPeriod) {
      voice.retriggerAge = 0;
      voice.gateAge = 0;
      voice.gated = true;
    }
  }
  if (voice.active) {
    voice.gateAge += 1;
  }
}

function macroAt(macro: number[] | null | undefined, age: number): number | null {
  if (!macro || macro.length === 0) {
    return null;
  }
  return macro[Math.min(age, macro.length - 1)] ?? null;
}

function aySoftVolume(instrument: Instrument | undefined, baseVolume: number, gateAge: number): number {
  if (!instrument || instrument.hardwareEnvelope) {
    return baseVolume;
  }
  const rate = instrument.envelopePeriod & 0x07;
  if (rate <= 0) {
    return baseVolume;
  }
  const steps = Math.floor(Math.max(0, gateAge - 1) / rate);
  const delta = instrument.envelopeDown === false ? steps : -steps;
  return Math.min(15, Math.max(0, baseVolume + delta));
}

function ayFrame(song: Song, voices: Voice[]): AyFrame {
  const frame = new Array<number>(16).fill(0);
  let mixer = 0x3f;
  let noisePeriod = 0;
  let noiseWritten = false;
  let hwEnvPeriod = 0x1000;
  let hwEnvShape = 0x0e;
  let hwEnvUsed = false;
  for (let channel = 0; channel < 3; channel += 1) {
    const voice = voices[channel];
    if (!voice.active) {
      continue;
    }
    const instrument = instrumentOf(song, voice.instrumentId);
    const age = Math.max(0, voice.gateAge - 1);
    const pitchOffset = macroAt(instrument?.pitchMacro, age) ?? 0;
    const midi = voice.note === null ? null : voice.note + pitchOffset;
    let period = midi === null ? 0 : ayPeriod(Math.min(127, Math.max(0, Math.round(midi))));
    let volume = voice.volume ?? instrument?.envelopeStart ?? 12;
    const volumeMacro = macroAt(instrument?.volumeMacro, age);
    if (volumeMacro !== null) {
      volume = volumeMacro & 0x0f;
    } else {
      volume = aySoftVolume(instrument, volume, voice.gateAge);
    }
    if (instrument?.kind === 'snip' && instrument.frames && instrument.frames.length > 0) {
      const captured = instrument.frames[Math.min(voice.snipIndex, instrument.frames.length - 1)];
      const dominant = dominantTone(captured);
      if (dominant.period > 0) {
        period = dominant.period;
        volume = dominant.volume || volume;
      }
      voice.snipIndex += 1;
    }
    frame[channel * 2] = period & 0xff;
    frame[channel * 2 + 1] = (period >> 8) & 0x0f;
    mixer &= ~(1 << channel);
    if (instrument?.mixNoise) {
      mixer &= ~(1 << (channel + 3));
      const noiseMacro = macroAt(instrument.noiseMacro, age);
      noisePeriod = noiseMacro !== null ? noiseMacro & 0x1f : (instrument.noisePeriod ?? 8) & 0x1f;
      noiseWritten = true;
    }
    if (instrument?.hardwareEnvelope) {
      frame[8 + channel] = 0x10 | (volume & 0x0f);
      hwEnvPeriod = (instrument.hardwareEnvelopePeriod ?? 0x1000) & 0xffff;
      hwEnvShape = (instrument.hardwareEnvelopeShape ?? 0x0e) & 0x0f;
      hwEnvUsed = true;
    } else {
      frame[8 + channel] = volume & 0x0f;
    }
  }
  if (noiseWritten) {
    frame[6] = noisePeriod & 0x1f;
  }
  if (hwEnvUsed) {
    frame[11] = hwEnvPeriod & 0xff;
    frame[12] = (hwEnvPeriod >> 8) & 0xff;
    frame[13] = hwEnvShape & 0x0f;
  }
  frame[7] = mixer;
  return frame;
}

function envelopeByte(instrument: Instrument | undefined, volume: number | null): number {
  const start = volume ?? instrument?.envelopeStart ?? 12;
  const direction = instrument?.envelopeDown === false ? 1 : 0;
  const period = instrument?.envelopePeriod ?? 3;
  return ((start & 0x0f) << 4) | (direction << 3) | (period & 0x07);
}

function gbFrame(song: Song, voices: Voice[]): GbFrame {
  const frame: GbFrame = {
    nr10: 0, nr11: 0, nr12: 0, nr13: 0, nr14: 0,
    nr21: 0, nr22: 0, nr23: 0, nr24: 0,
    nr30: 0, nr32: 0, nr33: 0, nr34: 0,
    nr42: 0, nr43: 0, nr44: 0,
    wave: WAVEFORMS[0],
  };
  const pulse = (channel: number, prefix: 'nr1' | 'nr2') => {
    const voice = voices[channel];
    if (!voice.active || voice.note === null) {
      return;
    }
    const instrument = instrumentOf(song, voice.instrumentId);
    const frequency = gbFrequency(voice.note);
    const duty = (instrument?.duty ?? 2) & 0x03;
    if (prefix === 'nr1') {
      const sweepTime = instrument?.sweepTime ?? 0;
      const sweepShift = instrument?.sweepShift ?? 0;
      frame.nr10 = ((sweepTime & 7) << 4) | ((instrument?.sweepDown === false ? 1 : 0) << 3) | (sweepShift & 7);
      frame.nr11 = duty << 6;
      frame.nr12 = envelopeByte(instrument, voice.volume);
      frame.nr13 = frequency & 0xff;
      frame.nr14 = ((frequency >> 8) & 0x07) | 0x80;
    } else {
      frame.nr21 = duty << 6;
      frame.nr22 = envelopeByte(instrument, voice.volume);
      frame.nr23 = frequency & 0xff;
      frame.nr24 = ((frequency >> 8) & 0x07) | 0x80;
    }
  };
  pulse(0, 'nr1');
  pulse(1, 'nr2');
  const wave = voices[2];
  if (wave.active && wave.note !== null) {
    const instrument = instrumentOf(song, wave.instrumentId);
    const frequency = gbFrequency(wave.note);
    frame.nr30 = 0x80;
    frame.nr32 = 0x20;
    frame.nr33 = frequency & 0xff;
    frame.nr34 = ((frequency >> 8) & 0x07) | 0x80;
    frame.wave = WAVEFORMS[(instrument?.waveform ?? 0) % WAVEFORMS.length];
  }
  const noise = voices[3];
  if (noise.active) {
    const instrument = instrumentOf(song, noise.instrumentId);
    const shift = noise.note === null ? 8 : Math.min(15, Math.max(0, 80 - noise.note));
    frame.nr42 = envelopeByte(instrument, noise.volume);
    frame.nr43 = (shift << 4) | (instrument?.noiseShort ? 0x08 : 0) | 0x02;
    frame.nr44 = 0x80;
  }
  return frame;
}

function sidParamsFromVoice(song: Song, voice: Voice): SoftSidVoiceParams {
  const instrument = instrumentOf(song, voice.instrumentId);
  return {
    midi: voice.note,
    active: voice.active,
    attack: instrument?.attack ?? 2,
    decay: instrument?.decay ?? 4,
    sustain: instrument?.sustain ?? 10,
    release: instrument?.release ?? 4,
    waveTriangle: instrument?.waveTriangle ?? false,
    waveSaw: instrument?.waveSaw ?? false,
    wavePulse: instrument?.wavePulse ?? true,
    waveNoise: instrument?.waveNoise ?? false,
    pulseWidth: instrument?.pulseWidth ?? 2048,
    filterEnable: instrument?.filterEnable ?? false,
    volume: voice.volume ?? 12,
    age: voice.gateAge,
    gated: voice.gated,
  };
}

function sidFrame(song: Song, voices: Voice[]): SidFrame {
  const frame = emptySidFrame();
  let filterCutoff = 1024;
  let filterResonance = 8;
  let filterMode: 0 | 1 | 2 = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const voice = voices[channel];
    frame.voices[channel] = softSidVoiceFrame(sidParamsFromVoice(song, voice));
    const instrument = instrumentOf(song, voice.instrumentId);
    if (instrument?.filterEnable) {
      filterCutoff = instrument.filterCutoff ?? filterCutoff;
      filterResonance = instrument.filterResonance ?? filterResonance;
      filterMode = instrument.filterMode ?? filterMode;
    }
  }
  frame.filterCutoff = filterCutoff;
  frame.filterResonance = filterResonance;
  frame.filterMode = filterMode;
  return frame;
}

/** Render the whole order list to register frames. Muted channels are applied later, at playback. */
export function renderSong(song: Song): RenderedSong {
  const definition = chipDefinition(song.chip);
  const perRow = framesPerRow(song.tempo, definition.frameRate);
  const voices = silentVoices(definition.channels.length);
  const frames: AyFrame[] | GbFrame[] | SidFrame[] = [];
  for (const patternId of song.order) {
    const pattern = song.patterns.find((item) => item.id === patternId);
    if (!pattern) {
      continue;
    }
    for (const row of pattern.rows) {
      applyRow(voices, row);
      for (let tick = 0; tick < perRow; tick += 1) {
        voices.forEach(tickVoiceFx);
        if (song.chip === 'vectrex') {
          (frames as AyFrame[]).push(ayFrame(song, voices));
        } else if (song.chip === 'c64') {
          (frames as SidFrame[]).push(sidFrame(song, voices));
        } else {
          (frames as GbFrame[]).push(gbFrame(song, voices));
        }
      }
    }
  }
  if (song.chip === 'vectrex') {
    return { chip: 'vectrex', frameRate: definition.frameRate, framesPerRow: perRow, frames: frames as AyFrame[] };
  }
  if (song.chip === 'c64') {
    return { chip: 'c64', frameRate: definition.frameRate, framesPerRow: perRow, frames: frames as SidFrame[] };
  }
  return { chip: 'gameboy', frameRate: definition.frameRate, framesPerRow: perRow, frames: frames as GbFrame[] };
}
