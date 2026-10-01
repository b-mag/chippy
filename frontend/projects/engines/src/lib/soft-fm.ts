import { fmAlgorithmRouting, type FmPatch } from '@chippy/domain';
import { midiToHz } from './timing';

/**
 * Soft four-operator FM, shared by the YM2612 (Genesis), YM2608 (PC-98), and
 * YM2151 (X68000) chips. The frame layer resolves envelopes and levels once per
 * register frame; the sample layer does the phase modulation. OPM has eight
 * channels instead of six and ignores SSG-EG, which is the only difference the
 * soft engine needs to care about.
 */

export interface FmOperatorFrame {
  /** Pitch multiple applied to the channel frequency. */
  ratio: number;
  /** Fixed detune offset in Hz, added after the multiple. */
  detuneHz: number;
  /** Output level 0-1 after total level and the operator envelope. */
  level: number;
}

export interface FmVoiceFrame {
  /** Channel fundamental in Hz. 0 when silent. */
  hz: number;
  /** Operator connection, 0-7. */
  algorithm: number;
  /** Operator 1 self-feedback, 0-1. */
  feedback: number;
  /** Channel level from the cell volume, 0-1. */
  amp: number;
  operators: [FmOperatorFrame, FmOperatorFrame, FmOperatorFrame, FmOperatorFrame];
  /** LFO rate in Hz. 0 disables modulation. */
  lfoHz: number;
  /** Peak LFO pitch deviation, in semitones. */
  pitchDepth: number;
  /** Peak LFO amplitude dip, 0-1. */
  ampDepth: number;
}

export interface FmFrame {
  channels: FmVoiceFrame[];
}

export interface SoftFmChannelParams {
  midi: number | null;
  active: boolean;
  patch: FmPatch;
  /** Cell or instrument volume, 0-15. */
  volume: number;
  volumeMacro: number[] | null;
  pitchMacro: number[] | null;
  /** Frames since the note was gated on. */
  gateAge: number;
  gated: boolean;
  /** Register frames per second, so envelope rates are tempo independent. */
  frameRate: number;
}

/** YM2612 LFO rates, in Hz. */
const LFO_HZ = [3.98, 5.56, 6.02, 6.37, 6.88, 9.63, 48.1, 72.2];
/** Peak pitch deviation per PMS setting, in semitones. */
const PMS_SEMITONES = [0, 0.034, 0.067, 0.1, 0.14, 0.2, 0.4, 0.8];
/** Peak amplitude dip per AMS setting, 0-1. */
const AMS_DEPTH = [0, 0.15, 0.5, 0.8];

/**
 * How far a modulator's output bends the carrier phase, in cycles, at full
 * level. Chosen so the mid-range total levels presets use read as bright but
 * not broken.
 */
const MODULATION_INDEX = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Total level 0-127 to a linear level. Each step is 0.75 dB. */
function totalLevelToLinear(tl: number): number {
  return 10 ** (-0.0375 * clamp(tl, 0, 127));
}

/** Sustain level 0-15 to a linear level. Each step is 3 dB; 15 is silence. */
function sustainLevelToLinear(sl: number): number {
  const value = clamp(sl, 0, 15);
  return value >= 15 ? 0 : 10 ** (-0.15 * value);
}

/**
 * Envelope rate 0-31 to a duration in frames. Rate 31 is immediate and rate 0
 * never finishes, matching the hardware's "off" rate.
 */
function rateToFrames(rate: number, frameRate: number, milliseconds: number): number {
  const value = clamp(rate, 0, 31);
  if (value >= 31) {
    return 0.5;
  }
  if (value <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const seconds = (milliseconds * 2 ** ((31 - value) / 4)) / 1000;
  return Math.max(0.5, seconds * frameRate);
}

/** Key scaling speeds the envelope up as the note rises. */
function scaledRate(rate: number, ks: number, midi: number): number {
  if (ks <= 0) {
    return rate;
  }
  const keyBoost = (clamp(midi, 0, 127) / 127) * 8 * (clamp(ks, 0, 3) / 3);
  return clamp(rate + keyBoost, 0, 31);
}

function macroAt(macro: number[] | null | undefined, age: number): number | null {
  if (!macro || macro.length === 0) {
    return null;
  }
  return macro[Math.min(age, macro.length - 1)] ?? null;
}

/** One operator's envelope level, 0-1, including its total level. */
function operatorLevel(
  operator: FmPatch['operators'][number],
  params: SoftFmChannelParams,
  midi: number,
): number {
  const peak = totalLevelToLinear(operator.tl);
  if (peak <= 0) {
    return 0;
  }
  const sustain = sustainLevelToLinear(operator.sl);
  const age = Math.max(0, params.gateAge - 1);
  if (!params.gated) {
    // Release runs from the sustain level using the 0-15 release rate.
    const releaseFrames = rateToFrames(operator.rr * 2 + 1, params.frameRate, 6);
    const progress = clamp(age / releaseFrames, 0, 1);
    return peak * sustain * (1 - progress);
  }
  const attackFrames = rateToFrames(scaledRate(operator.ar, operator.ks, midi), params.frameRate, 4);
  if (age < attackFrames) {
    return peak * (age / attackFrames);
  }
  const decayFrames = rateToFrames(scaledRate(operator.dr, operator.ks, midi), params.frameRate, 6);
  const intoDecay = age - attackFrames;
  if (intoDecay < decayFrames) {
    return peak * (1 - (intoDecay / decayFrames) * (1 - sustain));
  }
  // Second decay keeps falling from the sustain level toward silence.
  const sustainFrames = rateToFrames(scaledRate(operator.sr, operator.ks, midi), params.frameRate, 12);
  if (!Number.isFinite(sustainFrames)) {
    return peak * sustain;
  }
  const intoSustain = intoDecay - decayFrames;
  return peak * sustain * clamp(1 - intoSustain / sustainFrames, 0, 1);
}

/** Frequency multiple. Setting 0 means one half. */
function multipleRatio(mul: number): number {
  const value = clamp(Math.round(mul), 0, 15);
  return value === 0 ? 0.5 : value;
}

/** Detune 0-3 bends sharp, 4-7 bends flat by the same amount. */
function detuneHz(dt: number): number {
  const value = clamp(Math.round(dt), 0, 7);
  const magnitude = value % 4;
  return (value >= 4 ? -1 : 1) * magnitude * 1.2;
}

export function silentFmVoiceFrame(): FmVoiceFrame {
  const operator: FmOperatorFrame = { ratio: 1, detuneHz: 0, level: 0 };
  return {
    hz: 0,
    algorithm: 7,
    feedback: 0,
    amp: 0,
    operators: [operator, operator, operator, operator],
    lfoHz: 0,
    pitchDepth: 0,
    ampDepth: 0,
  };
}

export function emptyFmFrame(channelCount: number): FmFrame {
  return { channels: Array.from({ length: channelCount }, () => silentFmVoiceFrame()) };
}

export function softFmVoiceFrame(params: SoftFmChannelParams): FmVoiceFrame {
  if (!params.active || params.midi === null) {
    return silentFmVoiceFrame();
  }
  const age = Math.max(0, params.gateAge - 1);
  const pitchOffset = macroAt(params.pitchMacro, age) ?? 0;
  const midi = clamp(Math.round(params.midi + pitchOffset), 0, 127);
  const volumeMacro = macroAt(params.volumeMacro, age);
  const level = clamp(volumeMacro ?? params.volume, 0, 15) / 15;
  if (level <= 0) {
    return silentFmVoiceFrame();
  }
  const patch = params.patch;
  const operators = patch.operators.map((operator) => ({
    ratio: multipleRatio(operator.mul),
    detuneHz: detuneHz(operator.dt),
    level: operatorLevel(operator, params, midi),
  })) as FmVoiceFrame['operators'];
  const routing = fmAlgorithmRouting(patch.algorithm);
  const audible = routing.carriers.some((index) => operators[index].level > 0.0001);
  if (!audible) {
    return silentFmVoiceFrame();
  }
  return {
    hz: midiToHz(midi),
    algorithm: clamp(Math.round(patch.algorithm), 0, 7),
    feedback: patch.feedback <= 0 ? 0 : 2 ** (clamp(patch.feedback, 0, 7) - 7),
    amp: level,
    operators,
    lfoHz: patch.lfoEnable ? LFO_HZ[clamp(Math.round(patch.lfoFrequency), 0, 7)] : 0,
    pitchDepth: patch.lfoEnable ? PMS_SEMITONES[clamp(Math.round(patch.pms), 0, 7)] : 0,
    ampDepth: patch.lfoEnable ? AMS_DEPTH[clamp(Math.round(patch.ams), 0, 3)] : 0,
  };
}

interface FmVoiceSynthState {
  phases: Float64Array;
  /** Last two operator 1 outputs, averaged for feedback like the hardware does. */
  feedback: [number, number];
  lfoPhase: number;
}

export interface FmSynthState {
  sampleRate: number;
  voices: FmVoiceSynthState[];
}

/** Oscillator state that must survive across frames so notes do not click. */
export function createFmSynthState(channelCount: number, sampleRate: number): FmSynthState {
  return {
    sampleRate,
    voices: Array.from({ length: channelCount }, () => ({
      phases: new Float64Array(4),
      feedback: [0, 0] as [number, number],
      lfoPhase: 0,
    })),
  };
}

const TWO_PI = Math.PI * 2;

/** One channel's sample. Advances that channel's operator phases. */
function fmVoiceSample(voice: FmVoiceSynthState, frame: FmVoiceFrame, sampleRate: number): number {
  if (frame.hz <= 0 || frame.amp <= 0) {
    // Keep the phases where they are; silence does not need to advance them.
    return 0;
  }
  let pitchScale = 1;
  let ampScale = 1;
  if (frame.lfoHz > 0) {
    const lfo = Math.sin(voice.lfoPhase * TWO_PI);
    voice.lfoPhase = (voice.lfoPhase + frame.lfoHz / sampleRate) % 1;
    if (frame.pitchDepth > 0) {
      pitchScale = 2 ** ((lfo * frame.pitchDepth) / 12);
    }
    if (frame.ampDepth > 0) {
      ampScale = 1 - frame.ampDepth * (0.5 - lfo * 0.5);
    }
  }
  const routing = fmAlgorithmRouting(frame.algorithm);
  const outputs = [0, 0, 0, 0];
  for (let op = 0; op < 4; op += 1) {
    const operator = frame.operators[op];
    let modulation = 0;
    if (op === 0 && frame.feedback > 0) {
      modulation = ((voice.feedback[0] + voice.feedback[1]) / 2) * frame.feedback;
    }
    for (const source of routing.modulators[op]) {
      modulation += outputs[source] * MODULATION_INDEX;
    }
    const sample = Math.sin((voice.phases[op] + modulation) * TWO_PI);
    outputs[op] = sample * operator.level;
    const hz = frame.hz * pitchScale * operator.ratio + operator.detuneHz;
    voice.phases[op] = (voice.phases[op] + Math.max(0, hz) / sampleRate) % 1;
  }
  voice.feedback[1] = voice.feedback[0];
  voice.feedback[0] = outputs[0];
  let mixed = 0;
  for (const carrier of routing.carriers) {
    mixed += outputs[carrier];
  }
  return (mixed / routing.carriers.length) * frame.amp * ampScale;
}

/**
 * Mix one sample of every channel in the frame.
 * `audible` lets playback apply mute and solo without re-rendering.
 */
export function fmSynthSample(
  state: FmSynthState,
  frame: FmFrame,
  audible?: (channel: number) => boolean,
): number {
  let mixed = 0;
  const count = Math.min(state.voices.length, frame.channels.length);
  for (let channel = 0; channel < count; channel += 1) {
    if (audible && !audible(channel)) {
      continue;
    }
    mixed += fmVoiceSample(state.voices[channel], frame.channels[channel], state.sampleRate);
  }
  // Six to eight simultaneous voices need headroom before the hard clip.
  return mixed * 0.4;
}

/**
 * Render a span of frames into samples. Both the WAV writer and live playback
 * use this so the exported file matches what the tracker plays.
 */
export function synthesizeFmSamples(
  state: FmSynthState,
  frames: FmFrame[],
  samplesPerFrame: number,
  target: Float32Array,
  audible?: (channel: number) => boolean,
): void {
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const offset = index * samplesPerFrame;
    for (let sample = 0; sample < samplesPerFrame; sample += 1) {
      target[offset + sample] = fmSynthSample(state, frame, audible);
    }
  }
}
