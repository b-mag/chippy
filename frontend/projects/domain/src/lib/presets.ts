import { baseInstrument } from './chips';
import type {
  ChipId,
  CustomInstrumentPreset,
  FmOperator,
  Instrument,
  InstrumentKind,
  InstrumentPatch,
  PresetRole,
} from './types';

export interface InstrumentPreset {
  id: string;
  name: string;
  chip: ChipId;
  kind: InstrumentKind;
  role: PresetRole;
  /** Premium presets need support perk or config.presets.unlockAll. */
  premium: boolean;
  patch: InstrumentPatch;
}

/** A row in the Role → Kind preset menu (built-in or project custom). */
export interface PresetMenuEntry {
  id: string;
  name: string;
  kind: InstrumentKind;
  role: PresetRole;
  premium: boolean;
  custom: boolean;
  source: InstrumentPreset | CustomInstrumentPreset;
}

export interface PresetKindGroup {
  kind: InstrumentKind;
  label: string;
  entries: PresetMenuEntry[];
}

export interface PresetRoleGroup {
  role: PresetRole;
  label: string;
  kinds: PresetKindGroup[];
}

const ROLE_ORDER: PresetRole[] = ['lead', 'bass', 'percussion', 'pad', 'fx'];
const ROLE_LABELS: Record<PresetRole, string> = {
  lead: 'Lead',
  bass: 'Bass',
  percussion: 'Percussion',
  pad: 'Pad',
  fx: 'FX',
};

const KIND_LABELS: Record<InstrumentKind, string> = {
  pulse: 'Pulse',
  wave: 'Wave',
  noise: 'Noise',
  tone: 'Tone',
  snip: 'Snip',
  sid: 'SID',
  triangle: 'Triangle',
  fm: 'FM',
};

function preset(
  id: string,
  name: string,
  chip: ChipId,
  kind: InstrumentKind,
  role: PresetRole,
  premium: boolean,
  patch: InstrumentPatch = {},
): InstrumentPreset {
  return { id, name, chip, kind, role, premium, patch };
}

/** Shorthand for one operator inside a preset FM patch. Unset fields keep their defaults. */
function op(values: Partial<FmOperator>): Partial<FmOperator> {
  return values;
}

/** Built-in starter banks. Values are original Chippy defaults, not copied dumps. */
export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  // Game Boy free
  preset('gb-pulse-lead', 'Pulse lead', 'gameboy', 'pulse', 'lead', false, {
    duty: 2,
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
  }),
  preset('gb-pulse-bass', 'Pulse bass', 'gameboy', 'pulse', 'bass', false, {
    duty: 1,
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('gb-sweep-kick', 'Sweep kick', 'gameboy', 'pulse', 'percussion', false, {
    duty: 0,
    envelopeStart: 15,
    envelopeDown: true,
    envelopePeriod: 2,
    sweepTime: 2,
    sweepDown: true,
    sweepShift: 4,
  }),
  preset('gb-wave-organ', 'Wave organ', 'gameboy', 'wave', 'pad', false, { waveform: 3, envelopeStart: 15 }),
  preset('gb-wave-tri', 'Wave triangle', 'gameboy', 'wave', 'bass', false, { waveform: 2, envelopeStart: 15 }),
  preset('gb-noise-snare', 'Noise snare', 'gameboy', 'noise', 'percussion', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    noiseShort: false,
  }),
  preset('gb-noise-hat', 'Noise hat', 'gameboy', 'noise', 'percussion', false, {
    envelopeStart: 8,
    envelopeDown: true,
    envelopePeriod: 1,
    noiseShort: true,
  }),
  // Game Boy premium
  preset('gb-pulse-soft', 'Soft pulse', 'gameboy', 'pulse', 'lead', true, {
    duty: 3,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 4,
  }),
  preset('gb-pulse-echo', 'Echo pulse', 'gameboy', 'pulse', 'lead', true, {
    duty: 2,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('gb-wave-saw', 'Wave saw', 'gameboy', 'wave', 'lead', true, { waveform: 1, envelopeStart: 15 }),
  preset('gb-noise-crash', 'Noise crash', 'gameboy', 'noise', 'percussion', true, {
    envelopeStart: 15,
    envelopeDown: true,
    envelopePeriod: 4,
    noiseShort: false,
  }),
  // Vectrex free
  preset('vx-tone-lead', 'Soft lead', 'vectrex', 'tone', 'lead', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('vx-tone-bass', 'Soft bass', 'vectrex', 'tone', 'bass', false, {
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 3,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('vx-noise-snare', 'Noise hit', 'vectrex', 'tone', 'percussion', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: true,
    noisePeriod: 4,
    hardwareEnvelope: false,
  }),
  preset('vx-staccato', 'Staccato', 'vectrex', 'tone', 'lead', false, {
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: false,
    hardwareEnvelope: false,
  }),
  // Vectrex premium
  preset('vx-hard-env', 'Hard envelope', 'vectrex', 'tone', 'lead', true, {
    envelopeStart: 15,
    hardwareEnvelope: true,
    hardwareEnvelopePeriod: 0x1000,
    hardwareEnvelopeShape: 0x0e,
    mixNoise: false,
  }),
  preset('vx-buzz-bass', 'Buzz bass', 'vectrex', 'tone', 'bass', true, {
    envelopeStart: 14,
    mixNoise: true,
    noisePeriod: 10,
    hardwareEnvelope: false,
    volumeMacro: [14, 13, 12, 11, 10, 9, 8],
  }),
  preset('vx-noise-wind', 'Noise wind', 'vectrex', 'tone', 'fx', true, {
    envelopeStart: 8,
    mixNoise: true,
    noisePeriod: 18,
    hardwareEnvelope: false,
    volumeMacro: [8, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  }),
  // C64 free
  preset('c64-pulse-lead', 'Pulse lead', 'c64', 'sid', 'lead', false, {
    attack: 2,
    decay: 4,
    sustain: 10,
    release: 4,
    wavePulse: true,
    waveSaw: false,
    pulseWidth: 2048,
  }),
  preset('c64-saw-bass', 'Saw bass', 'c64', 'sid', 'bass', false, {
    attack: 0,
    decay: 6,
    sustain: 8,
    release: 6,
    waveSaw: true,
    wavePulse: false,
    filterEnable: true,
    filterCutoff: 600,
    filterResonance: 10,
    filterMode: 0,
  }),
  preset('c64-noise-drum', 'Noise drum', 'c64', 'sid', 'percussion', false, {
    attack: 0,
    decay: 3,
    sustain: 0,
    release: 2,
    waveNoise: true,
    wavePulse: false,
  }),
  preset('c64-tri-pad', 'Triangle pad', 'c64', 'sid', 'pad', false, {
    attack: 6,
    decay: 4,
    sustain: 12,
    release: 8,
    waveTriangle: true,
    wavePulse: false,
  }),
  // C64 premium
  preset('c64-filter-sweep', 'Filter sweep', 'c64', 'sid', 'fx', true, {
    attack: 1,
    decay: 5,
    sustain: 9,
    release: 5,
    waveSaw: true,
    wavePulse: false,
    filterEnable: true,
    filterCutoff: 1400,
    filterResonance: 12,
    filterMode: 0,
  }),
  preset('c64-ring-lead', 'Ring lead', 'c64', 'sid', 'lead', true, {
    attack: 1,
    decay: 3,
    sustain: 11,
    release: 3,
    waveTriangle: true,
    wavePulse: false,
    ringMod: true,
  }),
  preset('c64-pluck', 'Pluck', 'c64', 'sid', 'lead', true, {
    attack: 0,
    decay: 8,
    sustain: 2,
    release: 4,
    wavePulse: true,
    pulseWidth: 512,
  }),
  // Atari ST free
  preset('st-tone-lead', 'Soft lead', 'atarist', 'tone', 'lead', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('st-tone-bass', 'Soft bass', 'atarist', 'tone', 'bass', false, {
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 3,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('st-noise-hit', 'Noise hit', 'atarist', 'tone', 'percussion', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: true,
    noisePeriod: 4,
    hardwareEnvelope: false,
  }),
  // Atari ST premium
  preset('st-hard-env', 'Hard envelope', 'atarist', 'tone', 'lead', true, {
    envelopeStart: 15,
    hardwareEnvelope: true,
    hardwareEnvelopePeriod: 0x1000,
    hardwareEnvelopeShape: 0x0e,
    mixNoise: false,
  }),
  preset('st-buzz-bass', 'Buzz bass', 'atarist', 'tone', 'bass', true, {
    envelopeStart: 14,
    mixNoise: true,
    noisePeriod: 10,
    hardwareEnvelope: false,
    volumeMacro: [14, 13, 12, 11, 10, 9, 8],
  }),
  preset('st-noise-wind', 'Noise wind', 'atarist', 'tone', 'fx', true, {
    envelopeStart: 8,
    mixNoise: true,
    noisePeriod: 18,
    hardwareEnvelope: false,
    volumeMacro: [8, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  }),
  // NES free
  preset('nes-pulse-lead', 'Pulse lead', 'nes', 'pulse', 'lead', false, {
    duty: 2,
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
  }),
  preset('nes-pulse-bass', 'Pulse bass', 'nes', 'pulse', 'bass', false, {
    duty: 1,
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('nes-tri-bass', 'Triangle bass', 'nes', 'triangle', 'bass', false, { envelopeStart: 15 }),
  preset('nes-noise-snare', 'Noise snare', 'nes', 'noise', 'percussion', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    noiseShort: false,
  }),
  // NES premium
  preset('nes-kick-bass', 'Kick-bass', 'nes', 'triangle', 'bass', true, {
    envelopeStart: 15,
    pitchMacro: [12, 8, 4, 0],
  }),
  preset('nes-pulse-soft', 'Soft pulse', 'nes', 'pulse', 'lead', true, {
    duty: 3,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 4,
  }),
  preset('nes-pulse-echo', 'Echo pulse', 'nes', 'pulse', 'lead', true, {
    duty: 2,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('nes-noise-hat', 'Noise hat', 'nes', 'noise', 'percussion', true, {
    envelopeStart: 8,
    envelopeDown: true,
    envelopePeriod: 1,
    noiseShort: true,
  }),
  preset('nes-noise-tom', 'Noise tom', 'nes', 'noise', 'percussion', true, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
    noiseShort: false,
  }),
  // Genesis (YM2612) free
  preset('gen-fm-lead', 'FM lead', 'genesis', 'fm', 'lead', false, {
    fm: {
      algorithm: 4,
      feedback: 4,
      operators: [
        op({ tl: 30, mul: 2, ar: 31, dr: 10, sr: 4, rr: 7, sl: 2 }),
        op({ tl: 6, mul: 1, ar: 31, dr: 7, sr: 2, rr: 7, sl: 1 }),
        op({ tl: 38, mul: 4, dt: 3, ar: 31, dr: 12, sr: 5, rr: 8, sl: 3 }),
        op({ tl: 10, mul: 1, ar: 31, dr: 8, sr: 2, rr: 8, sl: 1 }),
      ],
    },
  }),
  preset('gen-fm-bass', 'FM bass', 'genesis', 'fm', 'bass', false, {
    fm: {
      algorithm: 2,
      feedback: 6,
      operators: [
        op({ tl: 26, mul: 1, ar: 31, dr: 14, sr: 6, rr: 9, sl: 4 }),
        op({ tl: 34, mul: 2, ar: 31, dr: 16, sr: 7, rr: 9, sl: 5 }),
        op({ tl: 30, mul: 1, ar: 31, dr: 14, sr: 6, rr: 9, sl: 4 }),
        op({ tl: 4, mul: 1, ar: 31, dr: 12, sr: 4, rr: 9, sl: 2 }),
      ],
    },
  }),
  preset('gen-fm-brass', 'FM brass', 'genesis', 'fm', 'pad', false, {
    fm: {
      algorithm: 3,
      feedback: 3,
      operators: [
        op({ tl: 28, mul: 1, ar: 22, dr: 9, sr: 2, rr: 6, sl: 1 }),
        op({ tl: 24, mul: 1, ar: 20, dr: 8, sr: 2, rr: 6, sl: 1 }),
        op({ tl: 32, mul: 2, dt: 1, ar: 20, dr: 9, sr: 2, rr: 6, sl: 1 }),
        op({ tl: 6, mul: 1, ar: 20, dr: 7, sr: 1, rr: 6, sl: 1 }),
      ],
    },
  }),
  preset('gen-fm-kick', 'FM kick', 'genesis', 'fm', 'percussion', false, {
    fm: {
      algorithm: 0,
      feedback: 7,
      operators: [
        op({ tl: 20, mul: 0, ar: 31, dr: 24, sr: 20, rr: 15, sl: 12 }),
        op({ tl: 24, mul: 1, ar: 31, dr: 24, sr: 20, rr: 15, sl: 12 }),
        op({ tl: 28, mul: 1, ar: 31, dr: 24, sr: 20, rr: 15, sl: 12 }),
        op({ tl: 2, mul: 0, ar: 31, dr: 22, sr: 18, rr: 15, sl: 10 }),
      ],
    },
  }),
  // Genesis premium
  preset('gen-fm-bell', 'FM bell', 'genesis', 'fm', 'lead', true, {
    fm: {
      algorithm: 5,
      feedback: 2,
      operators: [
        op({ tl: 34, mul: 7, dt: 3, ar: 31, dr: 10, sr: 6, rr: 6, sl: 4 }),
        op({ tl: 12, mul: 1, ar: 31, dr: 13, sr: 7, rr: 6, sl: 5 }),
        op({ tl: 16, mul: 3, dt: 1, ar: 31, dr: 15, sr: 8, rr: 6, sl: 6 }),
        op({ tl: 20, mul: 5, dt: 6, ar: 31, dr: 17, sr: 9, rr: 6, sl: 7 }),
      ],
    },
  }),
  preset('gen-fm-sweep', 'FM sweep', 'genesis', 'fm', 'fx', true, {
    pitchMacro: [0, 3, 7, 12, 17, 22, 24],
    fm: {
      algorithm: 1,
      feedback: 7,
      operators: [
        op({ tl: 22, mul: 3, dt: 2, ar: 28, dr: 10, sr: 3, rr: 7, sl: 2 }),
        op({ tl: 26, mul: 5, dt: 5, ar: 28, dr: 10, sr: 3, rr: 7, sl: 2 }),
        op({ tl: 30, mul: 1, ar: 28, dr: 11, sr: 4, rr: 7, sl: 3 }),
        op({ tl: 8, mul: 1, ar: 28, dr: 9, sr: 3, rr: 7, sl: 2 }),
      ],
    },
  }),
  // PC-98 (YM2608 / OPNA) free
  preset('pc98-fm-lead', 'OPNA lead', 'pc98', 'fm', 'lead', false, {
    fm: {
      algorithm: 4,
      feedback: 5,
      operators: [
        op({ tl: 28, mul: 3, dt: 1, ar: 31, dr: 9, sr: 3, rr: 7, sl: 2 }),
        op({ tl: 6, mul: 1, ar: 31, dr: 7, sr: 2, rr: 7, sl: 1 }),
        op({ tl: 36, mul: 2, dt: 4, ar: 31, dr: 11, sr: 4, rr: 7, sl: 3 }),
        op({ tl: 12, mul: 1, ar: 31, dr: 8, sr: 2, rr: 7, sl: 2 }),
      ],
    },
  }),
  preset('pc98-fm-bass', 'OPNA bass', 'pc98', 'fm', 'bass', false, {
    fm: {
      algorithm: 0,
      feedback: 5,
      operators: [
        op({ tl: 30, mul: 1, ar: 31, dr: 15, sr: 6, rr: 9, sl: 4 }),
        op({ tl: 34, mul: 1, ar: 31, dr: 15, sr: 6, rr: 9, sl: 4 }),
        op({ tl: 32, mul: 2, ar: 31, dr: 15, sr: 6, rr: 9, sl: 4 }),
        op({ tl: 4, mul: 1, ar: 31, dr: 13, sr: 5, rr: 9, sl: 3 }),
      ],
    },
  }),
  preset('pc98-fm-strings', 'OPNA strings', 'pc98', 'fm', 'pad', false, {
    fm: {
      algorithm: 6,
      feedback: 2,
      operators: [
        op({ tl: 30, mul: 1, ar: 16, dr: 6, sr: 1, rr: 5, sl: 1 }),
        op({ tl: 14, mul: 1, dt: 1, ar: 16, dr: 6, sr: 1, rr: 5, sl: 1 }),
        op({ tl: 18, mul: 1, dt: 5, ar: 16, dr: 6, sr: 1, rr: 5, sl: 1 }),
        op({ tl: 22, mul: 2, dt: 2, ar: 16, dr: 7, sr: 1, rr: 5, sl: 2 }),
      ],
    },
  }),
  preset('pc98-fm-snare', 'OPNA snare', 'pc98', 'fm', 'percussion', false, {
    fm: {
      algorithm: 1,
      feedback: 7,
      operators: [
        op({ tl: 18, mul: 11, dt: 3, ar: 31, dr: 26, sr: 22, rr: 15, sl: 13 }),
        op({ tl: 22, mul: 13, dt: 6, ar: 31, dr: 26, sr: 22, rr: 15, sl: 13 }),
        op({ tl: 26, mul: 9, ar: 31, dr: 26, sr: 22, rr: 15, sl: 13 }),
        op({ tl: 6, mul: 7, ar: 31, dr: 24, sr: 20, rr: 15, sl: 12 }),
      ],
    },
  }),
  // PC-98 premium
  preset('pc98-fm-bell', 'OPNA bell', 'pc98', 'fm', 'lead', true, {
    fm: {
      algorithm: 7,
      feedback: 1,
      operators: [
        op({ tl: 14, mul: 1, ar: 31, dr: 12, sr: 6, rr: 6, sl: 4 }),
        op({ tl: 22, mul: 3, dt: 1, ar: 31, dr: 14, sr: 7, rr: 6, sl: 5 }),
        op({ tl: 28, mul: 6, dt: 5, ar: 31, dr: 16, sr: 8, rr: 6, sl: 6 }),
        op({ tl: 34, mul: 9, dt: 3, ar: 31, dr: 18, sr: 9, rr: 6, sl: 7 }),
      ],
    },
  }),
  // X68000 (YM2151 / OPM) free
  preset('x68-fm-lead', 'OPM lead', 'x68000', 'fm', 'lead', false, {
    fm: {
      algorithm: 4,
      feedback: 6,
      operators: [
        op({ tl: 26, mul: 2, dt: 2, ar: 31, dr: 8, sr: 3, rr: 7, sl: 2 }),
        op({ tl: 4, mul: 1, ar: 31, dr: 6, sr: 2, rr: 7, sl: 1 }),
        op({ tl: 34, mul: 4, dt: 5, ar: 31, dr: 10, sr: 4, rr: 7, sl: 3 }),
        op({ tl: 10, mul: 1, ar: 31, dr: 7, sr: 2, rr: 7, sl: 2 }),
      ],
    },
  }),
  preset('x68-fm-bass', 'OPM bass', 'x68000', 'fm', 'bass', false, {
    fm: {
      algorithm: 2,
      feedback: 7,
      operators: [
        op({ tl: 24, mul: 1, ar: 31, dr: 16, sr: 7, rr: 10, sl: 5 }),
        op({ tl: 32, mul: 3, ar: 31, dr: 18, sr: 8, rr: 10, sl: 6 }),
        op({ tl: 28, mul: 1, dt: 1, ar: 31, dr: 16, sr: 7, rr: 10, sl: 5 }),
        op({ tl: 2, mul: 1, ar: 31, dr: 14, sr: 5, rr: 10, sl: 3 }),
      ],
    },
  }),
  preset('x68-fm-pad', 'OPM pad', 'x68000', 'fm', 'pad', false, {
    fm: {
      algorithm: 6,
      feedback: 1,
      lfoEnable: true,
      lfoFrequency: 3,
      pms: 2,
      operators: [
        op({ tl: 32, mul: 1, ar: 14, dr: 5, sr: 1, rr: 4, sl: 1 }),
        op({ tl: 16, mul: 1, dt: 2, ar: 14, dr: 5, sr: 1, rr: 4, sl: 1 }),
        op({ tl: 20, mul: 1, dt: 6, ar: 14, dr: 5, sr: 1, rr: 4, sl: 1 }),
        op({ tl: 24, mul: 2, dt: 1, ar: 14, dr: 6, sr: 1, rr: 4, sl: 2 }),
      ],
    },
  }),
  preset('x68-fm-hat', 'OPM hat', 'x68000', 'fm', 'percussion', false, {
    fm: {
      algorithm: 7,
      feedback: 7,
      operators: [
        op({ tl: 20, mul: 12, dt: 7, ar: 31, dr: 28, sr: 24, rr: 15, sl: 14 }),
        op({ tl: 24, mul: 14, dt: 4, ar: 31, dr: 28, sr: 24, rr: 15, sl: 14 }),
        op({ tl: 28, mul: 10, dt: 2, ar: 31, dr: 28, sr: 24, rr: 15, sl: 14 }),
        op({ tl: 32, mul: 15, dt: 6, ar: 31, dr: 28, sr: 24, rr: 15, sl: 14 }),
      ],
    },
  }),
  // X68000 premium
  preset('x68-fm-organ', 'OPM organ', 'x68000', 'fm', 'pad', true, {
    fm: {
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ tl: 10, mul: 1, ar: 31, dr: 0, sr: 0, rr: 8, sl: 0 }),
        op({ tl: 18, mul: 2, ar: 31, dr: 0, sr: 0, rr: 8, sl: 0 }),
        op({ tl: 24, mul: 4, ar: 31, dr: 0, sr: 0, rr: 8, sl: 0 }),
        op({ tl: 30, mul: 8, ar: 31, dr: 0, sr: 0, rr: 8, sl: 0 }),
      ],
    },
  }),
];

export function presetsForChip(chip: ChipId): InstrumentPreset[] {
  return INSTRUMENT_PRESETS.filter((item) => item.chip === chip);
}

/** Default role when saving a custom preset from an instrument kind. */
export function defaultRoleForKind(kind: InstrumentKind): PresetRole {
  if (kind === 'noise') {
    return 'percussion';
  }
  if (kind === 'triangle' || kind === 'wave') {
    return 'bass';
  }
  if (kind === 'snip') {
    return 'fx';
  }
  return 'lead';
}

export function roleLabel(role: PresetRole): string {
  return ROLE_LABELS[role];
}

export function kindLabel(kind: InstrumentKind): string {
  return KIND_LABELS[kind];
}

/** Group built-ins + project customs for the Role → Kind picker. */
export function groupPresetsForMenu(
  chip: ChipId,
  customs: CustomInstrumentPreset[],
): PresetRoleGroup[] {
  const entries: PresetMenuEntry[] = [
    ...presetsForChip(chip).map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      role: item.role,
      premium: item.premium,
      custom: false,
      source: item,
    })),
    ...customs
      .filter((item) => item.chip === chip)
      .map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        role: item.role,
        premium: false,
        custom: true,
        source: item,
      })),
  ];
  const groups: PresetRoleGroup[] = [];
  for (const role of ROLE_ORDER) {
    const inRole = entries.filter((entry) => entry.role === role);
    if (inRole.length === 0) {
      continue;
    }
    const kindIds = [...new Set(inRole.map((entry) => entry.kind))];
    const kinds: PresetKindGroup[] = kindIds.map((kind) => ({
      kind,
      label: KIND_LABELS[kind],
      entries: inRole.filter((entry) => entry.kind === kind),
    }));
    groups.push({ role, label: ROLE_LABELS[role], kinds });
  }
  return groups;
}

/** Snapshot instrument fields into a patch (excludes id/name). */
export function instrumentToPresetPatch(instrument: Instrument): InstrumentPatch {
  const { id: _id, name: _name, ...rest } = instrument;
  return rest;
}

/** Materialize a preset into a concrete instrument with a fresh id. */
export function instrumentFromPreset(
  preset: Pick<InstrumentPreset, 'name' | 'kind' | 'patch'>,
  id: string,
): Instrument {
  return baseInstrument({
    id,
    name: preset.name,
    kind: preset.kind,
    ...preset.patch,
  });
}
