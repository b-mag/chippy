import { chipDefinition, type Instrument, type Song } from '@chippy/domain';
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

export type RenderedSong =
  | { chip: 'vectrex'; frameRate: number; framesPerRow: number; frames: AyFrame[] }
  | { chip: 'gameboy'; frameRate: number; framesPerRow: number; frames: GbFrame[] };

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
}

function instrumentOf(song: Song, id: string | null): Instrument | undefined {
  return song.instruments.find((item) => item.id === id);
}

function silentVoices(): Voice[] {
  return Array.from({ length: 4 }, () => ({
    note: null,
    instrumentId: null,
    volume: null,
    snipIndex: 0,
    active: false,
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

function applyRow(song: Song, voices: Voice[], row: { note: number | null; cut: boolean; instrumentId: string | null; volume: number | null }[]): void {
  voices.forEach((voice, index) => {
    const cell = row[index];
    if (!cell) {
      return;
    }
    if (cell.cut) {
      voice.active = false;
      voice.note = null;
      return;
    }
    if (cell.note !== null) {
      voice.active = true;
      voice.note = cell.note;
      voice.instrumentId = cell.instrumentId;
      voice.volume = cell.volume;
      voice.snipIndex = 0;
    } else if (cell.volume !== null) {
      voice.volume = cell.volume;
    }
  });
}

function ayFrame(song: Song, voices: Voice[]): AyFrame {
  const frame = new Array<number>(16).fill(0);
  let mixer = 0x3f;
  for (let channel = 0; channel < 3; channel += 1) {
    const voice = voices[channel];
    if (!voice.active) {
      continue;
    }
    const instrument = instrumentOf(song, voice.instrumentId);
    let period = voice.note === null ? 0 : ayPeriod(voice.note);
    let volume = voice.volume ?? instrument?.envelopeStart ?? 12;
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
      frame[6] = 8;
    }
    if (instrument?.hardwareEnvelope) {
      frame[8 + channel] = 0x10 | (volume & 0x0f);
      frame[11] = 0x00;
      frame[12] = 0x10;
      frame[13] = 0x0e;
    } else {
      frame[8 + channel] = volume & 0x0f;
    }
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

/** Render the whole order list to register frames. Muted channels are applied later, at playback. */
export function renderSong(song: Song): RenderedSong {
  const definition = chipDefinition(song.chip);
  const perRow = framesPerRow(song.tempo, definition.frameRate);
  const voices = silentVoices();
  const frames: AyFrame[] | GbFrame[] = [];
  for (const patternId of song.order) {
    const pattern = song.patterns.find((item) => item.id === patternId);
    if (!pattern) {
      continue;
    }
    for (const row of pattern.rows) {
      applyRow(song, voices, row);
      for (let tick = 0; tick < perRow; tick += 1) {
        if (song.chip === 'vectrex') {
          (frames as AyFrame[]).push(ayFrame(song, voices));
        } else {
          (frames as GbFrame[]).push(gbFrame(song, voices));
        }
      }
    }
  }
  if (song.chip === 'vectrex') {
    return { chip: 'vectrex', frameRate: definition.frameRate, framesPerRow: perRow, frames: frames as AyFrame[] };
  }
  return { chip: 'gameboy', frameRate: definition.frameRate, framesPerRow: perRow, frames: frames as GbFrame[] };
}
