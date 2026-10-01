import { midiToHz } from './timing';

/** One soft-2A03 channel state for a single register frame (playback / PCM). */
export interface NesChannelFrame {
  /** Fundamental frequency in Hz. 0 when silent. */
  hz: number;
  /** Linear amplitude 0-1. */
  amp: number;
  wave: 'pulse' | 'triangle' | 'noise' | 'none';
  /** Pulse duty 0-3 (12.5% / 25% / 50% / 75%). */
  duty: 0 | 1 | 2 | 3;
  /** NES noise mode: short LFSR when true. */
  noiseShort: boolean;
}

export interface NesFrame {
  channels: [NesChannelFrame, NesChannelFrame, NesChannelFrame, NesChannelFrame];
}

export interface SoftNesChannelParams {
  midi: number | null;
  active: boolean;
  wave: 'pulse' | 'triangle' | 'noise';
  duty: 0 | 1 | 2 | 3;
  volume: number;
  envelopeDown: boolean;
  envelopePeriod: number;
  noiseShort: boolean;
  /** Frames since gate on. */
  gateAge: number;
}

const DUTY_FRACTIONS = [0.125, 0.25, 0.5, 0.75];

/** Soft volume envelope shared with Game Boy-style period/direction. */
function softVolume(params: SoftNesChannelParams): number {
  const base = Math.min(15, Math.max(0, params.volume));
  if (params.wave === 'triangle') {
    return params.active && params.midi !== null ? 15 : 0;
  }
  const rate = params.envelopePeriod & 0x07;
  if (rate <= 0) {
    return base;
  }
  const steps = Math.floor(Math.max(0, params.gateAge - 1) / rate);
  const delta = params.envelopeDown === false ? steps : -steps;
  return Math.min(15, Math.max(0, base + delta));
}

/** Map MIDI to a plausible NES noise period rate (higher MIDI → faster noise). */
export function nesNoiseHz(midi: number): number {
  const clamped = Math.min(108, Math.max(24, midi));
  return 40 + (108 - clamped) * 12;
}

export function softNesChannelFrame(params: SoftNesChannelParams): NesChannelFrame {
  if (!params.active || params.midi === null) {
    return { hz: 0, amp: 0, wave: 'none', duty: 2, noiseShort: false };
  }
  const level = softVolume(params);
  if (level <= 0) {
    return { hz: 0, amp: 0, wave: 'none', duty: params.duty, noiseShort: params.noiseShort };
  }
  const amp = level / 15;
  if (params.wave === 'noise') {
    return {
      hz: nesNoiseHz(params.midi),
      amp,
      wave: 'noise',
      duty: params.duty,
      noiseShort: params.noiseShort,
    };
  }
  return {
    hz: midiToHz(params.midi),
    // Web Audio / soft triangle is quieter than square at the same linear amp.
    amp: params.wave === 'triangle' ? Math.max(0.7, amp) : amp,
    wave: params.wave,
    duty: params.duty,
    noiseShort: false,
  };
}

export function emptyNesFrame(): NesFrame {
  const silent: NesChannelFrame = { hz: 0, amp: 0, wave: 'none', duty: 2, noiseShort: false };
  return { channels: [silent, silent, silent, silent] };
}

export function nesDutyFraction(duty: number): number {
  return DUTY_FRACTIONS[duty & 0x03] ?? 0.5;
}
