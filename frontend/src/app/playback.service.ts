import { Injectable, signal } from '@angular/core';
import {
  auditionChannelIndex,
  chipDefinition,
  emptyCell,
  PATTERN_ROWS,
  type Song,
} from '@chippy/domain';
import {
  renderSong,
  WAVEFORMS,
  type AyFrame,
  type GbFrame,
  type RenderedSong,
  type SidFrame,
} from '@chippy/engines';

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
  private oscillators: OscillatorNode[] = [];
  private noiseNodes: AudioBufferSourceNode[] = [];
  private noiseGains: GainNode[] = [];
  private waveGain: GainNode | null = null;
  private waveSource: AudioBufferSourceNode | null = null;
  private waveSampleKey = '';
  private rendered: RenderedSong | null = null;
  private absoluteRow = 0;
  private playOrderIndex = 0;
  private loopMode: LoopMode = 'off';
  private mutedChannels = new Set<number>();
  private soloChannels = new Set<number>();
  private songRows = 0;
  private envShape = 0x0e;
  private envPeriod = 0x1000;
  private envClock = 0;

  /**
   * Play a short engine-rendered one-shot of the armed instrument at `midi`.
   * Skipped while song playback is active so pattern-loop tweaks stay clear.
   */
  audition(song: Song, midi: number): void {
    if (this.playing()) {
      return;
    }
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
    this.prepareVoices(context, channelCount);
    window.clearInterval(this.auditionTimer);
    const framesToPlay = Math.min(rendered.frames.length, rendered.framesPerRow * 5);
    let index = 0;
    const emptyMute = new Set<number>();
    const emptySolo = new Set<number>();
    const step = () => {
      if (index >= framesToPlay) {
        window.clearInterval(this.auditionTimer);
        this.auditionTimer = 0;
        this.silenceAll();
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
    this.rendered = null;
    this.silenceAll();
  }

  /** Update mute/solo while a song is already playing. */
  setMuteSolo(muted: ReadonlySet<number>, solo: ReadonlySet<number>): void {
    this.mutedChannels = new Set(muted);
    this.soloChannels = new Set(solo);
  }

  /**
   * Re-render the active song into the play buffer without resetting the playhead.
   * Used so instrument studio edits are heard while a pattern/song loop runs.
   */
  hotReload(song: Song): void {
    if (!this.playing() || this.timer === 0) {
      return;
    }
    this.rendered = renderSong(song);
    this.songRows = song.order.length * PATTERN_ROWS;
  }

  play(song: Song, orderIndex: number, fromRow: number, loop: LoopMode, muted: Set<number>, solo: Set<number>): void {
    this.stop();
    this.rendered = renderSong(song);
    const context = this.ensure();
    this.prepareVoices(context, chipDefinition(song.chip).channels.length);
    this.playOrderIndex = orderIndex;
    this.loopMode = loop;
    this.mutedChannels = new Set(muted);
    this.soloChannels = new Set(solo);
    this.songRows = song.order.length * PATTERN_ROWS;
    this.absoluteRow = orderIndex * PATTERN_ROWS + fromRow;
    this.envClock = 0;
    const rowMs = 60000 / (song.tempo * 4);
    this.playing.set(true);
    const tick = () => {
      const rendered = this.rendered;
      if (!rendered) {
        this.stop();
        return;
      }
      const orderCount = Math.max(1, Math.floor(this.songRows / PATTERN_ROWS));
      if (this.loopMode === 'song' && this.absoluteRow >= this.songRows) {
        this.absoluteRow = 0;
      }
      let localOrder = Math.floor(this.absoluteRow / PATTERN_ROWS) % orderCount;
      if (this.loopMode === 'pattern' && localOrder !== this.playOrderIndex) {
        this.absoluteRow = this.playOrderIndex * PATTERN_ROWS;
        localOrder = this.playOrderIndex;
      }
      const localRow = this.absoluteRow % PATTERN_ROWS;
      const frameRow = this.loopMode === 'pattern'
        ? this.playOrderIndex * PATTERN_ROWS + localRow
        : this.absoluteRow % this.songRows;
      const frameIndex = Math.min(rendered.frames.length - 1, frameRow * rendered.framesPerRow);
      this.applyFrame(rendered.chip, rendered.frames[frameIndex], this.mutedChannels, this.soloChannels);
      this.row.set(localRow);
      this.orderIndex.set(localOrder);
      this.tick.set({ orderIndex: localOrder, row: localRow });
      this.absoluteRow += 1;
      if (this.loopMode === 'off' && this.absoluteRow >= this.songRows) {
        this.stop();
      }
    };
    tick();
    this.timer = window.setInterval(tick, rowMs);
  }

  private silenceAll(): void {
    this.gains.forEach((gain) => { gain.gain.value = 0; });
    this.noiseGains.forEach((gain) => { gain.gain.value = 0; });
    if (this.waveGain) {
      this.waveGain.gain.value = 0;
    }
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

  private noiseBuffer(context: AudioContext): AudioBuffer {
    const length = context.sampleRate;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let lfsr = 1;
    for (let index = 0; index < length; index += 1) {
      lfsr = (lfsr >> 1) | (((lfsr ^ (lfsr >> 1)) & 1) << 14);
      data[index] = lfsr & 1 ? 0.25 : -0.25;
    }
    return buffer;
  }

  private prepareVoices(context: AudioContext, count: number): void {
    if (this.gains.length === count && this.noiseGains.length === count && this.oscillators.length === count) {
      this.ensureWaveVoice(context);
      return;
    }
    this.gains.forEach((gain) => gain.disconnect());
    this.oscillators.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
      node.disconnect();
    });
    this.noiseNodes.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
      node.disconnect();
    });
    this.noiseGains.forEach((gain) => gain.disconnect());
    this.gains = [];
    this.oscillators = [];
    this.noiseNodes = [];
    this.noiseGains = [];
    const buffer = this.noiseBuffer(context);
    for (let index = 0; index < count; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 440;
      gain.gain.value = 0;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      this.gains.push(gain);
      this.oscillators.push(oscillator);

      const noiseGain = context.createGain();
      noiseGain.gain.value = 0;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      noise.connect(noiseGain).connect(context.destination);
      noise.start();
      this.noiseNodes.push(noise);
      this.noiseGains.push(noiseGain);
    }
    this.ensureWaveVoice(context);
  }

  private ensureWaveVoice(context: AudioContext): void {
    if (this.waveGain) {
      return;
    }
    this.waveGain = context.createGain();
    this.waveGain.gain.value = 0;
    this.waveGain.connect(context.destination);
  }

  private setWaveVoice(samples: number[], hz: number, level: number): void {
    const context = this.ensure();
    this.ensureWaveVoice(context);
    const gain = this.waveGain;
    if (!gain) {
      return;
    }
    const key = samples.join(',');
    if (!this.waveSource || this.waveSampleKey !== key) {
      if (this.waveSource) {
        try { this.waveSource.stop(); } catch { /* already stopped */ }
        this.waveSource.disconnect();
        this.waveSource = null;
      }
      const buffer = context.createBuffer(1, 32, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < 32; index += 1) {
        data[index] = (((samples[index] ?? 0) / 15) * 2 - 1) * 0.35;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      this.waveSource = source;
      this.waveSampleKey = key;
    }
    // 32-sample loop at rate 1 ⇒ sampleRate/32 Hz; scale to the target pitch.
    this.waveSource.playbackRate.value = Math.max(0.01, (hz * 32) / context.sampleRate);
    gain.gain.value = level;
  }

  private hardwareEnvelopeLevel(shape: number, phase: number): number {
    const continueBit = (shape & 0x08) !== 0;
    const attack = (shape & 0x04) !== 0;
    const alternate = (shape & 0x02) !== 0;
    const hold = (shape & 0x01) !== 0;
    if (!continueBit) {
      const cycle = phase % 32;
      if (attack) {
        return cycle < 16 ? cycle / 15 : 0;
      }
      return cycle < 16 ? (15 - cycle) / 15 : 0;
    }
    if (hold && phase >= 16) {
      const endHigh = alternate ? !attack : attack;
      return endHigh ? 1 : 0;
    }
    if (alternate && Math.floor(phase / 16) % 2 === 1) {
      return (15 - (phase % 16)) / 15;
    }
    const step = phase % 16;
    return attack ? step / 15 : (15 - step) / 15;
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
      if (this.waveGain) {
        this.waveGain.gain.value = 0;
      }
      const ay = frame as AyFrame;
      const mixer = ay[7] ?? 0x3f;
      const noisePeriod = (ay[6] & 0x1f) || 1;
      const noiseRate = Math.max(0.25, 8 / noisePeriod);
      const envPeriod = ((ay[12] & 0xff) << 8) | (ay[11] & 0xff);
      if (envPeriod > 0) {
        this.envPeriod = envPeriod;
      }
      if (ay[8] & 0x10 || ay[9] & 0x10 || ay[10] & 0x10) {
        this.envShape = ay[13] & 0x0f;
      }
      this.envClock += 1;
      const envStep = Math.floor(this.envClock / Math.max(1, Math.floor(this.envPeriod / 256) || 1));
      for (let channel = 0; channel < 3; channel += 1) {
        const period = ay[channel * 2] | ((ay[channel * 2 + 1] & 0x0f) << 8);
        const toneOn = (mixer & (1 << channel)) === 0 && period > 0 && audible(channel);
        const noiseOn = (mixer & (1 << (channel + 3))) === 0 && audible(channel);
        const volReg = ay[8 + channel] ?? 0;
        const useEnv = (volReg & 0x10) !== 0;
        const level = useEnv
          ? this.hardwareEnvelopeLevel(this.envShape, envStep)
          : (volReg & 0x0f) / 15;
        this.gains[channel].gain.value = toneOn ? level * 0.12 : 0;
        if (toneOn && this.oscillators[channel]) {
          this.oscillators[channel].type = 'square';
          this.oscillators[channel].frequency.value = 1_500_000 / (16 * period);
        }
        if (this.noiseGains[channel]) {
          this.noiseGains[channel].gain.value = noiseOn ? level * 0.08 : 0;
          const noiseNode = this.noiseNodes[channel];
          if (noiseNode) {
            noiseNode.playbackRate.value = noiseRate;
          }
        }
      }
      return;
    }
    this.noiseGains.forEach((gain, index) => {
      if (chip !== 'gameboy' || index !== 3) {
        gain.gain.value = 0;
      }
    });
    if (chip === 'c64') {
      if (this.waveGain) {
        this.waveGain.gain.value = 0;
      }
      const sid = frame as SidFrame;
      for (let channel = 0; channel < 3; channel += 1) {
        const voice = sid.voices[channel];
        const on = voice.amp > 0 && voice.hz > 0 && voice.wave !== 'none' && audible(channel);
        this.gains[channel].gain.value = on ? voice.amp * 0.12 : 0;
        if (on && this.oscillators[channel]) {
          this.oscillators[channel].type = voice.wave === 'saw' ? 'sawtooth'
            : voice.wave === 'triangle' ? 'triangle'
              : voice.wave === 'noise' ? 'square'
                : 'square';
          this.oscillators[channel].frequency.value = voice.hz;
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
      const triggered = channel === 0 ? (gb.nr14 & 0x80) !== 0 : (gb.nr24 & 0x80) !== 0;
      const on = frequency > 0 && triggered && audible(channel);
      const envelope = channel === 0 ? gb.nr12 : gb.nr22;
      this.gains[channel].gain.value = on ? (((envelope >> 4) & 0x0f) / 15) * 0.12 : 0;
      if (on && this.oscillators[channel]) {
        this.oscillators[channel].type = 'square';
        this.oscillators[channel].frequency.value = 131072 / Math.max(1, 2048 - frequency);
      }
    });
    // Pulse oscillators are only channels 0–1; keep channel 2's square silent (wave uses wavetable).
    if (this.gains[2]) {
      this.gains[2].gain.value = 0;
    }
    const waveFreqReg = gb.nr33 | ((gb.nr34 & 7) << 8);
    const waveVolShift = (gb.nr32 >> 5) & 0x03;
    const waveLevel = waveVolShift === 0 ? 0 : waveVolShift === 1 ? 1 : waveVolShift === 2 ? 0.5 : 0.25;
    const waveOn = (gb.nr30 & 0x80) !== 0 && waveFreqReg > 0 && waveLevel > 0 && audible(2);
    if (waveOn) {
      // Match written note pitch (pulse clock) so WAV audition feels in tune with PU1/PU2.
      const hz = 131072 / Math.max(1, 2048 - waveFreqReg);
      const samples = gb.wave?.length ? gb.wave : WAVEFORMS[0];
      this.setWaveVoice(samples, hz, waveLevel * 0.2);
    } else if (this.waveGain) {
      this.waveGain.gain.value = 0;
    }
    if (this.gains[3]) {
      this.gains[3].gain.value = 0;
    }
    if (this.noiseGains[3]) {
      const on = (gb.nr44 & 0x80) !== 0 && audible(3);
      const level = ((gb.nr42 >> 4) & 0x0f) / 15;
      this.noiseGains[3].gain.value = on ? level * 0.12 : 0;
      const noiseNode = this.noiseNodes[3];
      if (noiseNode) {
        const shift = (gb.nr43 >> 4) & 0x0f;
        noiseNode.playbackRate.value = Math.max(0.25, (15 - shift) / 4);
      }
    }
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
