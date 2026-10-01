import { midiToHz } from './timing';

/** One soft-SID voice state for a single register frame (playback / PCM). */
export interface SidVoiceFrame {
  /** Fundamental frequency in Hz. 0 when silent. */
  hz: number;
  /** Linear amplitude 0-1 after ADSR. */
  amp: number;
  wave: 'triangle' | 'saw' | 'square' | 'noise' | 'none';
  /** Pulse width 0-1 when wave is square. */
  pulseWidth: number;
  filter: boolean;
}

export interface SidFrame {
  voices: [SidVoiceFrame, SidVoiceFrame, SidVoiceFrame];
  filterCutoff: number;
  filterResonance: number;
  /** 0 low, 1 band, 2 high. */
  filterMode: 0 | 1 | 2;
}

export interface SoftSidVoiceParams {
  midi: number | null;
  active: boolean;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  waveTriangle: boolean;
  waveSaw: boolean;
  wavePulse: boolean;
  waveNoise: boolean;
  pulseWidth: number;
  filterEnable: boolean;
  volume: number;
  /** Frames since gate on; -1 when off. */
  age: number;
  gated: boolean;
}

const ATTACK_FRAMES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 80, 96, 112, 128];
const DECAY_RELEASE_FRAMES = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 80, 96, 120, 160, 200];

function pickWave(params: SoftSidVoiceParams): SidVoiceFrame['wave'] {
  if (params.waveNoise) return 'noise';
  if (params.wavePulse) return 'square';
  if (params.waveSaw) return 'saw';
  if (params.waveTriangle) return 'triangle';
  return 'none';
}

function envelopeAmp(params: SoftSidVoiceParams): number {
  if (!params.active || params.midi === null) {
    return 0;
  }
  const sustainLevel = (params.sustain & 0x0f) / 15;
  const volScale = Math.min(15, Math.max(0, params.volume)) / 15;
  if (!params.gated) {
    const releaseFrames = DECAY_RELEASE_FRAMES[params.release & 0x0f];
    const t = Math.min(1, Math.max(0, params.age) / releaseFrames);
    return sustainLevel * (1 - t) * volScale;
  }
  const attackFrames = ATTACK_FRAMES[params.attack & 0x0f];
  if (params.age < attackFrames) {
    return (params.age / attackFrames) * volScale;
  }
  const decayFrames = DECAY_RELEASE_FRAMES[params.decay & 0x0f];
  const intoDecay = params.age - attackFrames;
  if (intoDecay < decayFrames) {
    const t = intoDecay / decayFrames;
    return (1 - t * (1 - sustainLevel)) * volScale;
  }
  return sustainLevel * volScale;
}

export function softSidVoiceFrame(params: SoftSidVoiceParams): SidVoiceFrame {
  const amp = envelopeAmp(params);
  if (amp <= 0.0001 || params.midi === null) {
    return { hz: 0, amp: 0, wave: 'none', pulseWidth: 0.5, filter: false };
  }
  return {
    hz: midiToHz(params.midi),
    amp,
    wave: pickWave(params),
    pulseWidth: Math.min(1, Math.max(0.01, (params.pulseWidth & 0xfff) / 4095)),
    filter: params.filterEnable,
  };
}

export function emptySidFrame(): SidFrame {
  const silent: SidVoiceFrame = { hz: 0, amp: 0, wave: 'none', pulseWidth: 0.5, filter: false };
  return {
    voices: [silent, silent, silent],
    filterCutoff: 1024,
    filterResonance: 8,
    filterMode: 0,
  };
}
