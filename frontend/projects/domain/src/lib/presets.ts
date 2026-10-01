import { baseInstrument } from './chips';
import type { ChipId, Instrument, InstrumentKind } from './types';

export interface InstrumentPreset {
  id: string;
  name: string;
  chip: ChipId;
  kind: InstrumentKind;
  /** Premium presets need support perk or config.presets.unlockAll. */
  premium: boolean;
  patch: Partial<Instrument>;
}

function preset(
  id: string,
  name: string,
  chip: ChipId,
  kind: InstrumentKind,
  premium: boolean,
  patch: Partial<Instrument> = {},
): InstrumentPreset {
  return { id, name, chip, kind, premium, patch };
}

/** Built-in starter banks. Values are original Chippy defaults, not copied LSDJ dumps. */
export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  // Game Boy free
  preset('gb-pulse-lead', 'Pulse lead', 'gameboy', 'pulse', false, {
    duty: 2,
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
  }),
  preset('gb-pulse-bass', 'Pulse bass', 'gameboy', 'pulse', false, {
    duty: 1,
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('gb-sweep-kick', 'Sweep kick', 'gameboy', 'pulse', false, {
    duty: 0,
    envelopeStart: 15,
    envelopeDown: true,
    envelopePeriod: 2,
    sweepTime: 2,
    sweepDown: true,
    sweepShift: 4,
  }),
  preset('gb-wave-organ', 'Wave organ', 'gameboy', 'wave', false, { waveform: 3, envelopeStart: 15 }),
  preset('gb-wave-tri', 'Wave triangle', 'gameboy', 'wave', false, { waveform: 2, envelopeStart: 15 }),
  preset('gb-noise-snare', 'Noise snare', 'gameboy', 'noise', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    noiseShort: false,
  }),
  preset('gb-noise-hat', 'Noise hat', 'gameboy', 'noise', false, {
    envelopeStart: 8,
    envelopeDown: true,
    envelopePeriod: 1,
    noiseShort: true,
  }),
  // Game Boy premium
  preset('gb-pulse-soft', 'Soft pulse', 'gameboy', 'pulse', true, {
    duty: 3,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 4,
  }),
  preset('gb-wave-saw', 'Wave saw', 'gameboy', 'wave', true, { waveform: 1, envelopeStart: 15 }),
  preset('gb-noise-crash', 'Noise crash', 'gameboy', 'noise', true, {
    envelopeStart: 15,
    envelopeDown: true,
    envelopePeriod: 4,
    noiseShort: false,
  }),
  // Vectrex free
  preset('vx-tone-lead', 'Soft lead', 'vectrex', 'tone', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('vx-tone-bass', 'Soft bass', 'vectrex', 'tone', false, {
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 3,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('vx-noise-snare', 'Noise hit', 'vectrex', 'tone', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: true,
    noisePeriod: 4,
    hardwareEnvelope: false,
  }),
  preset('vx-staccato', 'Staccato', 'vectrex', 'tone', false, {
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: false,
    hardwareEnvelope: false,
  }),
  // Vectrex premium
  preset('vx-hard-env', 'Hard envelope', 'vectrex', 'tone', true, {
    envelopeStart: 15,
    hardwareEnvelope: true,
    hardwareEnvelopePeriod: 0x1000,
    hardwareEnvelopeShape: 0x0e,
    mixNoise: false,
  }),
  preset('vx-noise-wind', 'Noise wind', 'vectrex', 'tone', true, {
    envelopeStart: 8,
    mixNoise: true,
    noisePeriod: 18,
    hardwareEnvelope: false,
    volumeMacro: [8, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  }),
  // C64 free
  preset('c64-pulse-lead', 'Pulse lead', 'c64', 'sid', false, {
    attack: 2,
    decay: 4,
    sustain: 10,
    release: 4,
    wavePulse: true,
    waveSaw: false,
    pulseWidth: 2048,
  }),
  preset('c64-saw-bass', 'Saw bass', 'c64', 'sid', false, {
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
  preset('c64-noise-drum', 'Noise drum', 'c64', 'sid', false, {
    attack: 0,
    decay: 3,
    sustain: 0,
    release: 2,
    waveNoise: true,
    wavePulse: false,
  }),
  preset('c64-tri-pad', 'Triangle pad', 'c64', 'sid', false, {
    attack: 6,
    decay: 4,
    sustain: 12,
    release: 8,
    waveTriangle: true,
    wavePulse: false,
  }),
  // C64 premium
  preset('c64-filter-sweep', 'Filter sweep', 'c64', 'sid', true, {
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
  preset('c64-ring-lead', 'Ring lead', 'c64', 'sid', true, {
    attack: 1,
    decay: 3,
    sustain: 11,
    release: 3,
    waveTriangle: true,
    wavePulse: false,
    ringMod: true,
  }),
  // Atari ST free
  preset('st-tone-lead', 'Soft lead', 'atarist', 'tone', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('st-tone-bass', 'Soft bass', 'atarist', 'tone', false, {
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 3,
    hardwareEnvelope: false,
    mixNoise: false,
  }),
  preset('st-noise-hit', 'Noise hit', 'atarist', 'tone', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 1,
    mixNoise: true,
    noisePeriod: 4,
    hardwareEnvelope: false,
  }),
  // Atari ST premium
  preset('st-hard-env', 'Hard envelope', 'atarist', 'tone', true, {
    envelopeStart: 15,
    hardwareEnvelope: true,
    hardwareEnvelopePeriod: 0x1000,
    hardwareEnvelopeShape: 0x0e,
    mixNoise: false,
  }),
  // NES free
  preset('nes-pulse-lead', 'Pulse lead', 'nes', 'pulse', false, {
    duty: 2,
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
  }),
  preset('nes-pulse-bass', 'Pulse bass', 'nes', 'pulse', false, {
    duty: 1,
    envelopeStart: 14,
    envelopeDown: true,
    envelopePeriod: 5,
  }),
  preset('nes-tri-bass', 'Triangle bass', 'nes', 'triangle', false, { envelopeStart: 15 }),
  preset('nes-noise-snare', 'Noise snare', 'nes', 'noise', false, {
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 2,
    noiseShort: false,
  }),
  // NES premium
  preset('nes-pulse-soft', 'Soft pulse', 'nes', 'pulse', true, {
    duty: 3,
    envelopeStart: 10,
    envelopeDown: true,
    envelopePeriod: 4,
  }),
  preset('nes-noise-hat', 'Noise hat', 'nes', 'noise', true, {
    envelopeStart: 8,
    envelopeDown: true,
    envelopePeriod: 1,
    noiseShort: true,
  }),
];

export function presetsForChip(chip: ChipId): InstrumentPreset[] {
  return INSTRUMENT_PRESETS.filter((item) => item.chip === chip);
}

/** Materialize a preset into a concrete instrument with a fresh id. */
export function instrumentFromPreset(preset: InstrumentPreset, id: string): Instrument {
  const created = baseInstrument({
    id,
    name: preset.name,
    kind: preset.kind,
    ...preset.patch,
  });
  return created;
}
