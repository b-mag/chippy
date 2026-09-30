import { Injectable, signal } from '@angular/core';
import type { Song } from '@chippy/domain';
import { renderSong, type AyFrame, type GbFrame } from '@chippy/engines';

/**
 * Oscillators live on the audio thread. Angular only hears about the
 * current pattern row, once per row, through `row`.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  readonly row = signal<number | null>(null);
  readonly playing = signal(false);
  private timer = 0;
  private context: AudioContext | null = null;
  private gains: GainNode[] = [];

  audition(song: Song, midi: number): void {
    const context = this.ensure();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.playing.set(false);
    this.row.set(null);
    this.gains.forEach((gain) => { gain.gain.value = 0; });
  }

  play(song: Song, orderIndex: number, fromRow: number, loopPattern: boolean, muted: Set<number>, solo: Set<number>): void {
    this.stop();
    const rendered = renderSong(song);
    const context = this.ensure();
    this.prepareVoices(context, song.chip === 'vectrex' ? 3 : 4);
    const perRow = rendered.framesPerRow;
    const patternRows = 16;
    const orderCount = song.order.length;
    let absoluteRow = orderIndex * patternRows + fromRow;
    const rowMs = 60000 / (song.tempo * 4);
    this.playing.set(true);
    const tick = () => {
      const localOrder = Math.floor(absoluteRow / patternRows) % orderCount;
      if (loopPattern && localOrder !== orderIndex) {
        absoluteRow = orderIndex * patternRows;
      }
      const frameIndex = Math.min(rendered.frames.length - 1, (loopPattern ? orderIndex * patternRows + (absoluteRow % patternRows) : absoluteRow) * perRow);
      this.applyFrame(rendered.chip, rendered.frames[frameIndex], muted, solo);
      this.row.set(absoluteRow % patternRows);
      absoluteRow += 1;
      if (!loopPattern && absoluteRow >= orderCount * patternRows) {
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

  private applyFrame(chip: 'gameboy' | 'vectrex', frame: AyFrame | GbFrame | undefined, muted: Set<number>, solo: Set<number>): void {
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
