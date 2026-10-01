import { Injectable, signal } from '@angular/core';
import {
  auditionChannelIndex,
  chipDefinition,
  emptyCell,
  PATTERN_ROWS,
  type Song,
} from '@chippy/domain';
import { renderSong, type AyFrame, type GbFrame, type SidFrame } from '@chippy/engines';

export type LoopMode = 'off' | 'pattern' | 'song';

export interface PlaybackTick {
  orderIndex: number;
  row: number;
}

/**
 * Oscillators live on the audio thread. Angular only hears about the
 * current pattern row, once per row, through `row` / `tick`.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  readonly row = signal<number | null>(null);
  readonly orderIndex = signal<number | null>(null);
  readonly tick = signal<PlaybackTick | null>(null);
  readonly playing = signal(false);
  private timer = 0;
  private auditionTimer = 0;
  private context: AudioContext | null = null;
  private gains: GainNode[] = [];

  /**
   * Play a short engine-rendered one-shot of the armed instrument at `midi`.
   * Does not disturb song playback scheduling state beyond a brief overlay
   * when nothing else is playing.
   */
  audition(song: Song, midi: number): void {
    const instrument = song.instruments.find((item) => item.id === song.armedInstrumentId) ?? song.instruments[0];
    const channel = auditionChannelIndex(song.chip, instrument.kind);
    const channelCount = chipDefinition(song.chip).channels.length;
    const rows = Array.from({ length: PATTERN_ROWS }, () =>
      Array.from({ length: channelCount }, () => emptyCell()),
    );
    rows[0][channel] = {
      note: midi,
      cut: false,
      instrumentId: instrument.id,
      volume: null,
      effect: null,
    };
    rows[4][channel] = { note: null, cut: true, instrumentId: null, volume: null, effect: null };
    const preview: Song = {
      name: 'audition',
      chip: song.chip,
      tempo: Math.max(song.tempo, 120),
      order: ['aud-pat'],
      patterns: [{ id: 'aud-pat', name: 'Audition', rows }],
      instruments: song.instruments,
      armedInstrumentId: song.armedInstrumentId,
    };
    const rendered = renderSong(preview);
    const context = this.ensure();
    const voiceCount = channelCount;
    const resumeSong = this.playing();
    if (!resumeSong) {
      this.prepareVoices(context, voiceCount);
    } else if (this.gains.length !== voiceCount) {
      this.prepareVoices(context, voiceCount);
    }
    window.clearInterval(this.auditionTimer);
    const framesToPlay = Math.min(rendered.frames.length, rendered.framesPerRow * 5);
    let index = 0;
    const emptyMute = new Set<number>();
    const emptySolo = new Set<number>();
    const step = () => {
      if (index >= framesToPlay) {
        window.clearInterval(this.auditionTimer);
        this.auditionTimer = 0;
        if (!resumeSong) {
          this.gains.forEach((gain) => {
            gain.gain.value = 0;
          });
        }
        return;
      }
      this.applyFrame(rendered.chip, rendered.frames[index], emptyMute, emptySolo);
      index += 1;
    };
    step();
    this.auditionTimer = window.setInterval(step, 1000 / rendered.frameRate);
  }

  stop(): void {
    window.clearInterval(this.timer);
    window.clearInterval(this.auditionTimer);
    this.timer = 0;
    this.auditionTimer = 0;
    this.playing.set(false);
    this.row.set(null);
    this.orderIndex.set(null);
    this.tick.set(null);
    this.gains.forEach((gain) => { gain.gain.value = 0; });
  }

  play(song: Song, orderIndex: number, fromRow: number, loop: LoopMode, muted: Set<number>, solo: Set<number>): void {
    this.stop();
    const rendered = renderSong(song);
    const context = this.ensure();
    this.prepareVoices(context, chipDefinition(song.chip).channels.length);
    const perRow = rendered.framesPerRow;
    const patternRows = 16;
    const orderCount = song.order.length;
    const songRows = orderCount * patternRows;
    let absoluteRow = orderIndex * patternRows + fromRow;
    const rowMs = 60000 / (song.tempo * 4);
    this.playing.set(true);
    const tick = () => {
      if (loop === 'song' && absoluteRow >= songRows) {
        absoluteRow = 0;
      }
      let localOrder = Math.floor(absoluteRow / patternRows) % orderCount;
      if (loop === 'pattern' && localOrder !== orderIndex) {
        absoluteRow = orderIndex * patternRows;
        localOrder = orderIndex;
      }
      const localRow = absoluteRow % patternRows;
      const frameRow = loop === 'pattern' ? orderIndex * patternRows + localRow : absoluteRow % songRows;
      const frameIndex = Math.min(rendered.frames.length - 1, frameRow * perRow);
      this.applyFrame(rendered.chip, rendered.frames[frameIndex], muted, solo);
      this.row.set(localRow);
      this.orderIndex.set(localOrder);
      this.tick.set({ orderIndex: localOrder, row: localRow });
      absoluteRow += 1;
      if (loop === 'off' && absoluteRow >= songRows) {
        this.stop();
      }
    };
    tick();
    this.timer = window.setInterval(tick, rowMs);
  }

  private ensure(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  private prepareVoices(context: AudioContext, count: number): void {
    if (this.gains.length === count) {
      return;
    }
    this.gains.forEach((gain) => gain.disconnect());
    this.gains = [];
    for (let index = 0; index < count; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 0;
      gain.gain.value = 0;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      this.gains.push(gain);
      (gain as GainNode & { oscillator?: OscillatorNode }).oscillator = oscillator;
    }
  }

  private applyFrame(
    chip: 'gameboy' | 'vectrex' | 'c64',
    frame: AyFrame | GbFrame | SidFrame | undefined,
    muted: Set<number>,
    solo: Set<number>,
  ): void {
    if (!frame) {
      return;
    }
    const audible = (channel: number) => (solo.size > 0 ? solo.has(channel) : !muted.has(channel));
    if (chip === 'vectrex') {
      const ay = frame as AyFrame;
      for (let channel = 0; channel < 3; channel += 1) {
        const node = this.gains[channel] as GainNode & { oscillator?: OscillatorNode };
        const period = ay[channel * 2] | ((ay[channel * 2 + 1] & 0x0f) << 8);
        const on = (ay[7] & (1 << channel)) === 0 && period > 0 && audible(channel);
        node.gain.value = on ? ((ay[8 + channel] & 0x0f) / 15) * 0.12 : 0;
        if (on && node.oscillator) {
          node.oscillator.frequency.value = 1_500_000 / (16 * period);
        }
      }
      return;
    }
    if (chip === 'c64') {
      const sid = frame as SidFrame;
      for (let channel = 0; channel < 3; channel += 1) {
        const node = this.gains[channel] as GainNode & { oscillator?: OscillatorNode };
        const voice = sid.voices[channel];
        const on = voice.amp > 0 && voice.hz > 0 && voice.wave !== 'none' && audible(channel);
        node.gain.value = on ? voice.amp * 0.12 : 0;
        if (on && node.oscillator) {
          node.oscillator.type = voice.wave === 'saw' ? 'sawtooth'
            : voice.wave === 'triangle' ? 'triangle'
              : voice.wave === 'noise' ? 'square'
                : 'square';
          node.oscillator.frequency.value = voice.hz;
        }
      }
      return;
    }
    const gb = frame as GbFrame;
    const pulses = [
      gb.nr13 | ((gb.nr14 & 7) << 8),
      gb.nr23 | ((gb.nr24 & 7) << 8),
    ];
    pulses.forEach((frequency, channel) => {
      const node = this.gains[channel] as GainNode & { oscillator?: OscillatorNode };
      const on = frequency > 0 && audible(channel);
      const envelope = channel === 0 ? gb.nr12 : gb.nr22;
      node.gain.value = on ? (((envelope >> 4) & 0x0f) / 15) * 0.1 : 0;
      if (on && node.oscillator) {
        node.oscillator.frequency.value = 131072 / (2048 - frequency);
      }
    });
  }

  playFrames(frames: AyFrame[], frameRate: number, start: number, end: number): void {
    this.stop();
    const context = this.ensure();
    this.prepareVoices(context, 3);
    let index = start;
    const last = Math.min(end, frames.length - 1);
    this.playing.set(true);
    this.timer = window.setInterval(() => {
      if (index > last) {
        index = start;
      }
      this.applyFrame('vectrex', frames[index], new Set(), new Set());
      index += 1;
    }, 1000 / frameRate);
  }
}
