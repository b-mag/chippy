import { baseInstrument } from './chips';
import type {
  ChipId,
  CustomInstrumentPreset,
  Instrument,
  InstrumentKind,
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
  patch: Partial<Instrument>;
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
};

function preset(
  id: string,
  name: string,
  chip: ChipId,
  kind: InstrumentKind,
  role: PresetRole,
  premium: boolean,
  patch: Partial<Instrument> = {},
): InstrumentPreset {
  return { id, name, chip, kind, role, premium, patch };
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
export function instrumentToPresetPatch(instrument: Instrument): Partial<Instrument> {
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
