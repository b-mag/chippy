import type { ChipId, Instrument, InstrumentKind } from './types';

export interface InstrumentField {
  key: keyof Instrument;
  label: string;
  control: 'select' | 'number' | 'toggle';
  min?: number;
  max?: number;
  options?: { value: number | boolean | string; label: string }[];
  kinds: InstrumentKind[];
  /** When set, the field is only shown while this channel is selected. */
  channelId?: string;
}

export interface ChipChannel {
  id: string;
  label: string;
}

export interface ChipDefinition {
  id: ChipId;
  label: string;
  /** PSG or APU master clock, in Hz. */
  clockHz: number;
  /** How often a full register frame is emitted while rendering. */
  frameRate: number;
  channels: ChipChannel[];
  fields: InstrumentField[];
  createDefaultInstrument(): Instrument;
}

const dutyOptions = [
  { value: 0, label: '12.5%' },
  { value: 1, label: '25%' },
  { value: 2, label: '50%' },
  { value: 3, label: '75%' },
];

const envelopePeriod = { key: 'envelopePeriod' as const, label: 'Envelope period', control: 'number' as const, min: 0, max: 7, kinds: ['pulse', 'noise'] as InstrumentKind[] };
const envelopeStart = { key: 'envelopeStart' as const, label: 'Envelope level', control: 'number' as const, min: 0, max: 15, kinds: ['pulse', 'noise', 'tone'] as InstrumentKind[] };
const envelopeDown = { key: 'envelopeDown' as const, label: 'Envelope falls', control: 'toggle' as const, kinds: ['pulse', 'noise'] as InstrumentKind[] };

function baseInstrument(partial: Partial<Instrument> & Pick<Instrument, 'id' | 'name' | 'kind'>): Instrument {
  return {
    duty: 2,
    envelopeStart: 12,
    envelopeDown: true,
    envelopePeriod: 3,
    sweepTime: 0,
    sweepDown: true,
    sweepShift: 0,
    waveform: 0,
    noiseShort: false,
    hardwareEnvelope: false,
    mixNoise: false,
    frames: null,
    ...partial,
  };
}

const gameboy: ChipDefinition = {
  id: 'gameboy',
  label: 'Game Boy',
  /** DMG APU derives tones from a 131072 Hz base, clocked by the 4.194304 MHz CPU. */
  clockHz: 4_194_304,
  frameRate: 60,
  channels: [
    { id: 'pulse1', label: 'Pulse 1' },
    { id: 'pulse2', label: 'Pulse 2' },
    { id: 'wave', label: 'Wave' },
    { id: 'noise', label: 'Noise' },
  ],
  fields: [
    { key: 'duty', label: 'Duty', control: 'select', options: dutyOptions, kinds: ['pulse'] },
    envelopeStart,
    envelopeDown,
    envelopePeriod,
    { key: 'sweepTime', label: 'Sweep time', control: 'number', min: 0, max: 7, kinds: ['pulse'], channelId: 'pulse1' },
    { key: 'sweepShift', label: 'Sweep shift', control: 'number', min: 0, max: 7, kinds: ['pulse'], channelId: 'pulse1' },
    { key: 'sweepDown', label: 'Sweep down', control: 'toggle', kinds: ['pulse'], channelId: 'pulse1' },
    {
      key: 'waveform',
      label: 'Waveform',
      control: 'select',
      kinds: ['wave'],
      options: [
        { value: 0, label: 'Square' },
        { value: 1, label: 'Saw' },
        { value: 2, label: 'Triangle' },
        { value: 3, label: 'Organ' },
      ],
    },
    { key: 'noiseShort', label: 'Short noise', control: 'toggle', kinds: ['noise'] },
  ],
  createDefaultInstrument() {
    return baseInstrument({ id: 'ins-1', name: 'Pulse lead', kind: 'pulse' });
  },
};

const vectrex: ChipDefinition = {
  id: 'vectrex',
  label: 'Vectrex',
  /** AY-3-8912 on the Vectrex is clocked at 1.5 MHz. Music frames are 50 Hz. */
  clockHz: 1_500_000,
  frameRate: 50,
  channels: [
    { id: 'tone1', label: 'Tone 1' },
    { id: 'tone2', label: 'Tone 2' },
    { id: 'tone3', label: 'Tone 3' },
  ],
  fields: [
    envelopeStart,
    { key: 'hardwareEnvelope', label: 'Hardware envelope', control: 'toggle', kinds: ['tone'] },
    { key: 'mixNoise', label: 'Noise', control: 'toggle', kinds: ['tone'] },
  ],
  createDefaultInstrument() {
    return baseInstrument({ id: 'ins-1', name: 'Tone', kind: 'tone', envelopeDown: false, envelopePeriod: 0 });
  },
};

const chips: Record<ChipId, ChipDefinition> = { gameboy, vectrex };

export function chipDefinition(id: ChipId): ChipDefinition {
  return chips[id];
}

export function chipIds(): ChipId[] {
  return ['gameboy', 'vectrex'];
}

export { baseInstrument };
