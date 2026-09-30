import { Injectable, inject, signal } from '@angular/core';
import { PlaybackService } from '../playback.service';
import { RADIO_STATIONS, type RadioStation } from './stations';

@Injectable({ providedIn: 'root' })
export class RadioPlayerService {
  private readonly playback = inject(PlaybackService);

  readonly stations = RADIO_STATIONS;
  readonly stationId = signal(RADIO_STATIONS[0].id);
  readonly playing = signal(false);
  readonly status = signal('Standby');
  readonly trackTitle = signal('');
  readonly vizEnabled = signal(false);

  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private wired = false;

  station(): RadioStation {
    return this.stations.find((entry) => entry.id === this.stationId()) ?? this.stations[0];
  }

  select(id: string): void {
    if (!this.stations.some((entry) => entry.id === id)) {
      return;
    }
    const wasPlaying = this.playing();
    this.stationId.set(id);
    this.trackTitle.set('');
    if (wasPlaying) {
      void this.play();
    } else {
      this.status.set(`Tuned · ${this.station().label}`);
    }
  }

  async play(): Promise<void> {
    this.playback.stop();
    const audio = this.ensureAudio();
    const station = this.station();
    this.status.set(`Tuning · ${station.label}`);
    this.trackTitle.set('');
    // Prefer CORS when the host allows it so the analyser can read bins.
    // Rainwave and some relays omit ACAO; leave unset so <audio> can still play.
    if (station.id === 'nectarine' || station.id === 'cvgm') {
      audio.crossOrigin = 'anonymous';
    } else {
      audio.removeAttribute('crossorigin');
    }
    audio.src = station.url;
    try {
      this.tryWireAnalyser(audio);
      await audio.play();
      this.playing.set(true);
      this.status.set('On air');
    } catch (error) {
      this.playing.set(false);
      this.vizEnabled.set(false);
      const message = error instanceof Error ? error.message : 'Playback failed';
      this.status.set(`Signal lost · ${message}`);
    }
  }

  stop(): void {
    const audio = this.audio;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.playing.set(false);
    this.trackTitle.set('');
    this.status.set('Standby');
  }

  /** Frequency-bin snapshot for the viz canvas. Empty when analyser is unavailable. */
  frequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.vizEnabled()) {
      return false;
    }
    this.analyser.getByteFrequencyData(target);
    return true;
  }

  analyserBinCount(): number {
    return this.analyser?.frequencyBinCount ?? 0;
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) {
      return this.audio;
    }
    const audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('error', () => {
      this.playing.set(false);
      this.vizEnabled.set(false);
      this.status.set('Signal lost · stream error');
    });
    audio.addEventListener('playing', () => {
      this.playing.set(true);
      this.status.set('On air');
    });
    this.audio = audio;
    return audio;
  }

  private tryWireAnalyser(audio: HTMLAudioElement): void {
    if (this.wired && this.analyser) {
      this.vizEnabled.set(true);
      return;
    }
    try {
      const context = this.context ?? new AudioContext();
      this.context = context;
      if (context.state === 'suspended') {
        void context.resume();
      }
      if (!this.source) {
        this.source = context.createMediaElementSource(audio);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        this.source.connect(analyser);
        analyser.connect(context.destination);
        this.analyser = analyser;
        this.wired = true;
      }
      this.vizEnabled.set(true);
    } catch {
      this.vizEnabled.set(false);
    }
  }
}
