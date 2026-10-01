import { Injectable, inject, signal } from '@angular/core';
import { PlaybackService } from '../playback.service';
import { RADIO_STATIONS, type RadioStation } from './stations';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;
const NOW_PLAYING_MS = 20_000;
/** Icecast often blips; wait this long before treating buffer underrun as a drop. */
const STALL_GRACE_MS = 8_000;

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
  private wiredCors: boolean | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private wantPlay = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private nowPlayingTimer: ReturnType<typeof setInterval> | null = null;
  private recovering = false;
  private lastSoftRecoverAt = 0;

  station(): RadioStation {
    return this.stations.find((entry) => entry.id === this.stationId()) ?? this.stations[0];
  }

  select(id: string): void {
    if (!this.stations.some((entry) => entry.id === id)) {
      return;
    }
    const wasPlaying = this.wantPlay;
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
    this.wantPlay = true;
    this.clearReconnect();
    this.reconnectAttempt = 0;
    this.lastSoftRecoverAt = 0;
    await this.startStream({ forceNewElement: true, bustUrl: false });
  }

  stop(): void {
    this.wantPlay = false;
    this.clearReconnect();
    this.stopNowPlayingPoll();
    this.teardownAudio();
    this.playing.set(false);
    this.trackTitle.set('');
    this.vizEnabled.set(false);
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

  private usesCors(station: RadioStation): boolean {
    if (!station.cors) {
      return false;
    }
    if (typeof location !== 'undefined'
      && location.protocol === 'https:'
      && station.url.startsWith('http:')) {
      return false;
    }
    return true;
  }

  /**
   * Soft Icecast recovery reuses the element and only reassigns `src`.
   * Hard fails rebuild the media element.
   */
  private async startStream(opts: { forceNewElement: boolean; bustUrl: boolean }): Promise<void> {
    const station = this.station();
    const cors = this.usesCors(station);

    if (typeof location !== 'undefined'
      && location.protocol === 'https:'
      && station.url.startsWith('http:')) {
      this.playing.set(false);
      this.vizEnabled.set(false);
      this.status.set('Signal lost · station is HTTP-only (use localhost HTTP or an HTTPS relay)');
      return;
    }

    if (opts.forceNewElement || !this.audio || this.wiredCors !== cors) {
      this.status.set(`Tuning · ${station.label}`);
      this.trackTitle.set('');
      this.createAudio(cors);
    } else {
      this.status.set('Buffering…');
    }

    const audio = this.audio;
    if (!audio) {
      return;
    }

    audio.src = this.streamUrl(station, opts.bustUrl);

    try {
      if (cors && !this.source) {
        this.tryWireAnalyser(audio);
      } else if (!cors) {
        this.vizEnabled.set(false);
      }
      if (this.context?.state === 'suspended') {
        await this.context.resume();
      }
      await audio.play();
      this.playing.set(true);
      this.status.set('On air');
      this.reconnectAttempt = 0;
      this.recovering = false;
      this.startNowPlayingPoll(station);
    } catch (error) {
      this.playing.set(false);
      this.vizEnabled.set(false);
      const message = error instanceof Error ? error.message : 'Playback failed';
      this.status.set(`Signal lost · ${message}`);
      if (this.wantPlay) {
        this.scheduleHardReconnect();
      }
    }
  }

  private streamUrl(station: RadioStation, bust: boolean): string {
    if (!bust) {
      return station.url;
    }
    const joiner = station.url.includes('?') ? '&' : '?';
    return `${station.url}${joiner}_=${Date.now()}`;
  }

  private createAudio(cors: boolean): HTMLAudioElement {
    this.teardownAudio();
    const audio = new Audio();
    audio.preload = 'none';
    // Ignore events from a discarded element (teardown / station switch).
    const alive = () => this.audio === audio;
    audio.addEventListener('error', () => {
      if (alive()) {
        void this.softRecover('stream error');
      }
    });
    // Icecast HTTP/1.0 often uses Connection: Close; browsers then fire `ended`
    // even though the station is still live. Soft-reopen the same element.
    audio.addEventListener('ended', () => {
      if (alive()) {
        void this.softRecover('ended');
      }
    });
    audio.addEventListener('stalled', () => {
      if (alive()) {
        this.onSoftStall();
      }
    });
    audio.addEventListener('waiting', () => {
      if (alive()) {
        this.onSoftStall();
      }
    });
    audio.addEventListener('playing', () => {
      if (!alive() || !this.wantPlay) {
        return;
      }
      this.clearStallTimer();
      this.playing.set(true);
      this.status.set('On air');
      this.recovering = false;
      this.reconnectAttempt = 0;
    });
    this.audio = audio;
    this.wiredCors = cors;
    if (cors) {
      audio.crossOrigin = 'anonymous';
    } else {
      audio.removeAttribute('crossorigin');
    }
    return audio;
  }

  private tryWireAnalyser(audio: HTMLAudioElement): void {
    try {
      const context = this.context ?? new AudioContext();
      this.context = context;
      if (context.state === 'suspended') {
        void context.resume();
      }
      this.source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      this.source.connect(analyser);
      analyser.connect(context.destination);
      this.analyser = analyser;
      this.vizEnabled.set(true);
    } catch {
      this.vizEnabled.set(false);
      this.source = null;
      this.analyser = null;
    }
  }

  /** Reopen the mount on the existing element — no "Retuning" teardown. */
  private async softRecover(reason: string): Promise<void> {
    if (!this.wantPlay || this.recovering) {
      return;
    }
    const now = Date.now();
    // Rapid ended/error loops mean the element graph is sick — rebuild it.
    if (this.lastSoftRecoverAt > 0 && now - this.lastSoftRecoverAt < 2500) {
      this.scheduleHardReconnect();
      return;
    }
    this.lastSoftRecoverAt = now;
    this.recovering = true;
    this.clearStallTimer();
    this.status.set('Buffering…');
    try {
      await this.startStream({ forceNewElement: false, bustUrl: true });
    } catch {
      this.status.set(`Signal lost · ${reason}`);
      this.scheduleHardReconnect();
    }
  }

  private onSoftStall(): void {
    if (!this.wantPlay || this.recovering || this.stallTimer) {
      return;
    }
    this.status.set('Buffering…');
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      const audio = this.audio;
      if (!this.wantPlay || !audio || this.recovering) {
        return;
      }
      if (audio.paused || audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        void this.softRecover('stalled');
      } else if (this.playing()) {
        this.status.set('On air');
      }
    }, STALL_GRACE_MS);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private scheduleHardReconnect(): void {
    if (!this.wantPlay || this.reconnectTimer) {
      return;
    }
    this.recovering = true;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.status.set(`Retuning · ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.wantPlay) {
        return;
      }
      void this.startStream({ forceNewElement: true, bustUrl: true });
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearStallTimer();
    this.recovering = false;
  }

  private startNowPlayingPoll(station: RadioStation): void {
    this.stopNowPlayingPoll();
    if (station.nowPlaying !== 'rainwave') {
      return;
    }
    void this.fetchRainwaveTitle();
    this.nowPlayingTimer = setInterval(() => {
      if (this.wantPlay && this.station().nowPlaying === 'rainwave') {
        void this.fetchRainwaveTitle();
      }
    }, NOW_PLAYING_MS);
  }

  private stopNowPlayingPoll(): void {
    if (this.nowPlayingTimer) {
      clearInterval(this.nowPlayingTimer);
      this.nowPlayingTimer = null;
    }
  }

  private async fetchRainwaveTitle(): Promise<void> {
    try {
      const response = await fetch('https://rainwave.cc/api4/info?sid=4');
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        sched_current?: { songs?: Array<{ title?: string; artists?: Array<{ name?: string }> }> };
      };
      const song = data.sched_current?.songs?.[0];
      if (!song?.title) {
        return;
      }
      const artists = (song.artists ?? [])
        .map((artist) => artist.name)
        .filter((name): name is string => Boolean(name))
        .join(', ');
      this.trackTitle.set(artists ? `${song.title} — ${artists}` : song.title);
    } catch {
      // Metadata is best-effort; keep status / prior title.
    }
  }

  private teardownAudio(): void {
    const audio = this.audio;
    // Drop reference first so in-flight error/ended handlers no-op via alive().
    this.audio = null;
    this.wiredCors = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // ignore
      }
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // already disconnected
      }
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.source = null;
    this.analyser = null;
  }
}
