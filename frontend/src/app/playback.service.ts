import { Injectable, signal } from '@angular/core';
import {
  auditionChannelIndex,
  chipDefinition,
  emptyCell,
  PATTERN_ROWS,
  type Song,
} from '@chippy/domain';
import {
  createFmSynthState,
  isFmChipId,
  isFmRender,
  renderSong,
  synthesizeFmSamples,
  WAVEFORMS,
  type AyFrame,
  type FmFrame,
  type FmSynthState,
  type GbFrame,
  type NesFrame,
  type RenderedSong,
  type SidFrame,
} from '@chippy/engines';

export type LoopMode = 'off' | 'pattern' | 'song';

export interface PlaybackTick {
  orderIndex: number;
  row: number;
}

/** Note + cut span for instrument audition (rows 0 and 4). */
const AUDITION_ROWS = 5;

/** Short looped LFSR noise; character matches a full-second buffer when looped. */
const NOISE_BUFFER_SAMPLES = 4096;

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
  private cachedNoiseBuffer: AudioBuffer | null = null;
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
   * Four-operator chips are synthesized into short buffers instead of driven
   * through oscillator nodes. The state carries operator phase across rows so
   * held notes do not click at row boundaries.
   */
  private fmState: FmSynthState | null = null;
  private fmGain: GainNode | null = null;
  private fmSources: AudioBufferSourceNode[] = [];
  private fmNextTime = 0;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private unlockArmed = false;
  private lifecycleWired = false;
  private resumeInFlight: Promise<AudioContext> | null = null;
  /** Bumped on stop so in-flight async play/audition aborts after await. */
  private playbackGeneration = 0;

  /**
   * Install capture listeners so the first user gesture creates and resumes
   * the AudioContext before play/audition need it. Safe to call multiple times.
   */
  armUnlock(): void {
    if (this.unlockArmed || typeof document === 'undefined') {
      return;
    }
    this.unlockArmed = true;
    const unlock = () => {
      void this.ensure();
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
  }

  /**
   * Play a short engine-rendered one-shot of the armed instrument at `midi`.
   * Skipped while song playback is active so pattern-loop tweaks stay clear.
   */
  audition(song: Song, midi: number): void {
    if (this.playing()) {
      return;
    }
    void this.auditionAsync(song, midi);
  }

  private async auditionAsync(song: Song, midi: number): Promise<void> {
    if (this.playing()) {
      return;
    }
    const generation = this.playbackGeneration;
    const instrument = song.instruments.find((item) => item.id === song.armedInstrumentId) ?? song.instruments[0];
    const channel = auditionChannelIndex(song.chip, instrument.kind);
    const channelCount = chipDefinition(song.chip).channels.length;
    const rows = Array.from({ length: AUDITION_ROWS }, () =>
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
    const context = await this.ensure();
    if (generation !== this.playbackGeneration || this.playing()) {
      return;
    }
    this.prepareVoices(context, channelCount);
    window.clearInterval(this.auditionTimer);
    const framesToPlay = Math.min(rendered.frames.length, rendered.framesPerRow * AUDITION_ROWS);
    if (isFmRender(rendered)) {
      this.stopFmSources();
      this.fmState = createFmSynthState(channelCount, context.sampleRate);
      this.scheduleFm(rendered.frames.slice(0, framesToPlay), rendered.frameRate, () => true);
      return;
    }
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
    this.playbackGeneration += 1;
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
    void this.playAsync(song, orderIndex, fromRow, loop, muted, solo);
  }

  private async playAsync(
    song: Song,
    orderIndex: number,
    fromRow: number,
    loop: LoopMode,
    muted: Set<number>,
    solo: Set<number>,
  ): Promise<void> {
    this.stop();
    const generation = this.playbackGeneration;
    this.rendered = renderSong(song);
    const context = await this.ensure();
    if (generation !== this.playbackGeneration) {
      return;
    }
    const channelCount = chipDefinition(song.chip).channels.length;
    this.prepareVoices(context, channelCount);
    this.fmState = isFmChipId(song.chip)
      ? createFmSynthState(channelCount, context.sampleRate)
      : null;
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
      if (isFmRender(rendered)) {
        const mutedChannels = this.mutedChannels;
        const soloChannels = this.soloChannels;
        this.scheduleFm(
          rendered.frames.slice(frameIndex, frameIndex + rendered.framesPerRow),
          rendered.frameRate,
          (channel) => (soloChannels.size > 0 ? soloChannels.has(channel) : !mutedChannels.has(channel)),
        );
      } else {
        this.applyFrame(rendered.chip, rendered.frames[frameIndex], this.mutedChannels, this.soloChannels);
      }
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
    this.stopFmSources();
  }

  private stopFmSources(): void {
    this.fmSources.forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    });
    this.fmSources = [];
    this.fmNextTime = 0;
  }

  private ensureFmGain(context: AudioContext): GainNode {
    if (!this.fmGain) {
      this.fmGain = context.createGain();
      this.fmGain.gain.value = 0.9;
      this.fmGain.connect(context.destination);
    }
    return this.fmGain;
  }

  /**
   * Synthesize a span of FM frames and queue it right after whatever is already
   * scheduled, so consecutive rows join without a gap.
   */
  private scheduleFm(frames: FmFrame[], frameRate: number, audible: (channel: number) => boolean): void {
    const state = this.fmState;
    const context = this.context;
    if (!state || !context || frames.length === 0) {
      return;
    }
    const samplesPerFrame = Math.round(context.sampleRate / frameRate);
    const buffer = context.createBuffer(1, frames.length * samplesPerFrame, context.sampleRate);
    synthesizeFmSamples(state, frames, samplesPerFrame, buffer.getChannelData(0), audible);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ensureFmGain(context));
    // A short lead on the first block absorbs timer jitter without audible lag.
    const when = Math.max(context.currentTime + 0.02, this.fmNextTime);
    source.start(when);
    this.fmNextTime = when + buffer.duration;
    this.fmSources.push(source);
    source.onended = () => {
      this.fmSources = this.fmSources.filter((item) => item !== source);
      source.disconnect();
    };
  }

  private async ensure(): Promise<AudioContext> {
    if (this.resumeInFlight) {
      return this.resumeInFlight;
    }
    this.resumeInFlight = this.ensureImpl();
    try {
      return await this.resumeInFlight;
    } finally {
      this.resumeInFlight = null;
    }
  }

  private async ensureImpl(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.wireLifecycle(this.context);
    }
    const context = this.context;
    if (context.state === 'suspended' || (context.state as string) === 'interrupted') {
      await context.resume();
    }
    this.startKeepAlive(context);
    return context;
  }

  private wireLifecycle(context: AudioContext): void {
    if (this.lifecycleWired || typeof document === 'undefined') {
      return;
    }
    this.lifecycleWired = true;
    context.addEventListener('statechange', () => {
      if (context.state === 'running') {
        this.startKeepAlive(context);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.context) {
        return;
      }
      if (this.context.state === 'suspended' || (this.context.state as string) === 'interrupted') {
        void this.ensure();
      }
    });
  }

  /** Zero-gain oscillator keeps the audio device open while the tab is active. */
  private startKeepAlive(context: AudioContext): void {
    if (this.keepAliveOsc || context.state !== 'running') {
      return;
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    const osc = context.createOscillator();
    osc.frequency.value = 20;
    osc.connect(gain);
    try {
      osc.start();
    } catch {
      gain.disconnect();
      return;
    }
    this.keepAliveGain = gain;
    this.keepAliveOsc = osc;
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    if (this.cachedNoiseBuffer && this.cachedNoiseBuffer.sampleRate === context.sampleRate) {
      return this.cachedNoiseBuffer;
    }
    const length = NOISE_BUFFER_SAMPLES;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let lfsr = 1;
    for (let index = 0; index < length; index += 1) {
      lfsr = (lfsr >> 1) | (((lfsr ^ (lfsr >> 1)) & 1) << 14);
      data[index] = lfsr & 1 ? 0.25 : -0.25;
    }
    this.cachedNoiseBuffer = buffer;
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
    const context = this.context;
    if (!context) {
      return;
    }
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
    chip: 'gameboy' | 'vectrex' | 'atarist' | 'c64' | 'nes',
    frame: AyFrame | GbFrame | SidFrame | NesFrame | undefined,
    muted: Set<number>,
    solo: Set<number>,
  ): void {
    if (!frame) {
      return;
    }
    const audible = (channel: number) => (solo.size > 0 ? solo.has(channel) : !muted.has(channel));
    if (chip === 'vectrex' || chip === 'atarist') {
      if (this.waveGain) {
        this.waveGain.gain.value = 0;
      }
      const ayClock = chipDefinition(chip).clockHz;
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
          this.oscillators[channel].frequency.value = ayClock / (16 * period);
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
      if ((chip !== 'gameboy' && chip !== 'nes') || index !== 3) {
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
    if (chip === 'nes') {
      if (this.waveGain) {
        this.waveGain.gain.value = 0;
      }
      const nes = frame as NesFrame;
      for (let channel = 0; channel < 4; channel += 1) {
        const voice = nes.channels[channel];
        const on = voice.amp > 0 && voice.hz > 0 && voice.wave !== 'none' && audible(channel);
        if (voice.wave === 'noise') {
          if (this.gains[channel]) {
            this.gains[channel].gain.value = 0;
          }
          if (this.noiseGains[channel]) {
            this.noiseGains[channel].gain.value = on ? voice.amp * 0.12 : 0;
            const noiseNode = this.noiseNodes[channel];
            if (noiseNode && on) {
              noiseNode.playbackRate.value = Math.max(0.25, voice.hz / 200);
            }
          }
          continue;
        }
        if (this.noiseGains[channel]) {
          this.noiseGains[channel].gain.value = 0;
        }
        if (on && this.oscillators[channel]) {
          this.oscillators[channel].type = voice.wave === 'triangle' ? 'triangle' : 'square';
          this.oscillators[channel].frequency.value = voice.hz;
        }
        const gainScale = voice.wave === 'triangle' ? 0.2 : 0.12;
        this.gains[channel].gain.value = on ? voice.amp * gainScale : 0;
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
    void this.playFramesAsync(frames, frameRate, start, end);
  }

  private async playFramesAsync(frames: AyFrame[], frameRate: number, start: number, end: number): Promise<void> {
    this.stop();
    const generation = this.playbackGeneration;
    const context = await this.ensure();
    if (generation !== this.playbackGeneration) {
      return;
    }
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
