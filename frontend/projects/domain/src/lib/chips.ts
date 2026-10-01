import type { ChipId, Instrument, InstrumentKind } from './types';

export interface InstrumentField {
  key: keyof Instrument;
  label: string;
  /** knob = rotary + linked number; macro = space-separated step list. */
  control: 'select' | 'number' | 'toggle' | 'knob' | 'macro';
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
  /** Short alias shown beside the label when useful (e.g. PU1). */
  alias?: string;
}

export interface ChipDefinition {
  id: ChipId;
  label: string;
  /** PSG or APU master clock, in Hz. */
  clockHz: number;
  /** How often a full register frame is emitted while rendering. */
  frameRate: number;
  channels: ChipChannel[];
  /** Instrument kinds this chip can create. */
  kinds: InstrumentKind[];
  fields: InstrumentField[];
  createDefaultInstrument(): Instrument;
  createInstrument(kind: InstrumentKind): Instrument;
  /** Kinds legal on the given channel id. */
  kindsForChannel(channelId: string): InstrumentKind[];
}

const dutyOptions = [
  { value: 0, label: '12.5%' },
  { value: 1, label: '25%' },
  { value: 2, label: '50%' },
  { value: 3, label: '75%' },
];

const filterModeOptions = [
  { value: 0, label: 'Low' },
  { value: 1, label: 'Band' },
  { value: 2, label: 'High' },
];

const envelopePeriod = { key: 'envelopePeriod' as const, label: 'Envelope period', control: 'knob' as const, min: 0, max: 7, kinds: ['pulse', 'noise'] as InstrumentKind[] };
const envelopeStart = { key: 'envelopeStart' as const, label: 'Envelope level', control: 'knob' as const, min: 0, max: 15, kinds: ['pulse', 'noise', 'tone'] as InstrumentKind[] };
const envelopeDown = { key: 'envelopeDown' as const, label: 'Envelope falls', control: 'toggle' as const, kinds: ['pulse', 'noise'] as InstrumentKind[] };

const ayEnvelopeShapes = [
  { value: 0x08, label: 'Fall repeat' },
  { value: 0x09, label: 'Fall hold' },
  { value: 0x0a, label: 'Fall / rise' },
  { value: 0x0b, label: 'Fall then high' },
  { value: 0x0c, label: 'Rise repeat' },
  { value: 0x0d, label: 'Rise hold' },
  { value: 0x0e, label: 'Rise / fall' },
  { value: 0x0f, label: 'Rise then low' },
];

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
    noisePeriod: 8,
    hardwareEnvelopePeriod: 0x1000,
    hardwareEnvelopeShape: 0x0e,
    volumeMacro: null,
    pitchMacro: null,
    noiseMacro: null,
    frames: null,
    attack: 2,
    decay: 4,
    sustain: 10,
    release: 4,
    waveTriangle: false,
    waveSaw: false,
    wavePulse: true,
    waveNoise: false,
    pulseWidth: 2048,
    ringMod: false,
    sync: false,
    filterEnable: false,
    filterCutoff: 1024,
    filterResonance: 8,
    filterMode: 0,
    ...partial,
  };
}

function gameboyInstrument(kind: InstrumentKind): Instrument {
  if (kind === 'wave') {
    return baseInstrument({ id: 'ins-1', name: 'Wave', kind: 'wave', envelopeStart: 15, envelopeDown: false, envelopePeriod: 0 });
  }
  if (kind === 'noise') {
    return baseInstrument({ id: 'ins-1', name: 'Noise', kind: 'noise', envelopeStart: 10, envelopePeriod: 2 });
  }
  return baseInstrument({ id: 'ins-1', name: 'Pulse lead', kind: 'pulse' });
}

function vectrexInstrument(kind: InstrumentKind): Instrument {
  if (kind === 'snip') {
    return baseInstrument({ id: 'ins-1', name: 'Snip', kind: 'snip', envelopeDown: false, envelopePeriod: 0, frames: [] });
  }
  return baseInstrument({ id: 'ins-1', name: 'Tone', kind: 'tone', envelopeDown: false, envelopePeriod: 0 });
}

function c64Instrument(_kind: InstrumentKind): Instrument {
  return baseInstrument({
    id: 'ins-1',
    name: 'SID lead',
    kind: 'sid',
    attack: 2,
    decay: 4,
    sustain: 10,
    release: 4,
    wavePulse: true,
    waveSaw: false,
    waveTriangle: false,
    waveNoise: false,
    pulseWidth: 2048,
    filterEnable: false,
  });
}

const gameboy: ChipDefinition = {
  id: 'gameboy',
  label: 'Game Boy',
  /** DMG APU derives tones from a 131072 Hz base, clocked by the 4.194304 MHz CPU. */
  clockHz: 4_194_304,
  frameRate: 60,
  channels: [
    { id: 'pulse1', label: 'Pulse 1', alias: 'PU1' },
    { id: 'pulse2', label: 'Pulse 2', alias: 'PU2' },
    { id: 'wave', label: 'Wave', alias: 'WAV' },
    { id: 'noise', label: 'Noise', alias: 'NOI' },
  ],
  kinds: ['pulse', 'wave', 'noise'],
  fields: [
    { key: 'duty', label: 'Duty', control: 'select', options: dutyOptions, kinds: ['pulse'] },
    envelopeStart,
    envelopeDown,
    envelopePeriod,
    { key: 'sweepTime', label: 'Sweep time', control: 'knob', min: 0, max: 7, kinds: ['pulse'], channelId: 'pulse1' },
    { key: 'sweepShift', label: 'Sweep shift', control: 'knob', min: 0, max: 7, kinds: ['pulse'], channelId: 'pulse1' },
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
    return gameboyInstrument('pulse');
  },
  createInstrument(kind: InstrumentKind) {
    if (!this.kinds.includes(kind)) {
      return this.createDefaultInstrument();
    }
    return gameboyInstrument(kind);
  },
  kindsForChannel(channelId: string) {
    if (channelId === 'wave') {
      return ['wave'];
    }
    if (channelId === 'noise') {
      return ['noise'];
    }
    return ['pulse'];
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
  kinds: ['tone', 'snip'],
  fields: [
    { key: 'envelopeStart', label: 'Level', control: 'knob', min: 0, max: 15, kinds: ['tone'] },
    { key: 'envelopeDown', label: 'Soft env falls', control: 'toggle', kinds: ['tone'] },
    { key: 'envelopePeriod', label: 'Soft env rate', control: 'knob', min: 0, max: 7, kinds: ['tone'] },
    { key: 'hardwareEnvelope', label: 'Hardware envelope', control: 'toggle', kinds: ['tone'] },
    {
      key: 'hardwareEnvelopePeriod',
      label: 'HW env period',
      control: 'knob',
      min: 0,
      max: 65535,
      kinds: ['tone'],
    },
    {
      key: 'hardwareEnvelopeShape',
      label: 'HW env shape',
      control: 'select',
      options: ayEnvelopeShapes,
      kinds: ['tone'],
    },
    { key: 'mixNoise', label: 'Noise', control: 'toggle', kinds: ['tone'] },
    { key: 'noisePeriod', label: 'Noise period', control: 'knob', min: 0, max: 31, kinds: ['tone'] },
    { key: 'volumeMacro', label: 'Volume macro', control: 'macro', min: 0, max: 15, kinds: ['tone'] },
    { key: 'pitchMacro', label: 'Pitch macro', control: 'macro', min: -24, max: 24, kinds: ['tone'] },
    { key: 'noiseMacro', label: 'Noise macro', control: 'macro', min: 0, max: 31, kinds: ['tone'] },
  ],
  createDefaultInstrument() {
    return vectrexInstrument('tone');
  },
  createInstrument(kind: InstrumentKind) {
    if (!this.kinds.includes(kind)) {
      return this.createDefaultInstrument();
    }
    return vectrexInstrument(kind);
  },
  kindsForChannel() {
    return ['tone', 'snip'];
  },
};

const c64: ChipDefinition = {
  id: 'c64',
  label: 'C64',
  /** MOS 6581/8580 clocked near 1 MHz on PAL; soft SID uses this for period math. */
  clockHz: 985_248,
  frameRate: 50,
  channels: [
    { id: 'voice1', label: 'Voice 1', alias: 'VO1' },
    { id: 'voice2', label: 'Voice 2', alias: 'VO2' },
    { id: 'voice3', label: 'Voice 3', alias: 'VO3' },
  ],
  kinds: ['sid'],
  fields: [
    { key: 'attack', label: 'Attack', control: 'knob', min: 0, max: 15, kinds: ['sid'] },
    { key: 'decay', label: 'Decay', control: 'knob', min: 0, max: 15, kinds: ['sid'] },
    { key: 'sustain', label: 'Sustain', control: 'knob', min: 0, max: 15, kinds: ['sid'] },
    { key: 'release', label: 'Release', control: 'knob', min: 0, max: 15, kinds: ['sid'] },
    { key: 'waveTriangle', label: 'Triangle', control: 'toggle', kinds: ['sid'] },
    { key: 'waveSaw', label: 'Saw', control: 'toggle', kinds: ['sid'] },
    { key: 'wavePulse', label: 'Pulse', control: 'toggle', kinds: ['sid'] },
    { key: 'waveNoise', label: 'Noise', control: 'toggle', kinds: ['sid'] },
    { key: 'pulseWidth', label: 'Pulse width', control: 'knob', min: 0, max: 4095, kinds: ['sid'] },
    { key: 'ringMod', label: 'Ring mod', control: 'toggle', kinds: ['sid'] },
    { key: 'sync', label: 'Sync', control: 'toggle', kinds: ['sid'] },
    { key: 'filterEnable', label: 'Filter', control: 'toggle', kinds: ['sid'] },
    { key: 'filterCutoff', label: 'Cutoff', control: 'knob', min: 0, max: 2047, kinds: ['sid'] },
    { key: 'filterResonance', label: 'Resonance', control: 'knob', min: 0, max: 15, kinds: ['sid'] },
    { key: 'filterMode', label: 'Filter mode', control: 'select', options: filterModeOptions, kinds: ['sid'] },
  ],
  createDefaultInstrument() {
    return c64Instrument('sid');
  },
  createInstrument(kind: InstrumentKind) {
    if (!this.kinds.includes(kind)) {
      return this.createDefaultInstrument();
    }
    return c64Instrument(kind);
  },
  kindsForChannel() {
    return ['sid'];
  },
};

const chips: Record<ChipId, ChipDefinition> = { gameboy, vectrex, c64 };

export function chipDefinition(id: ChipId): ChipDefinition {
  return chips[id];
}

export function chipIds(): ChipId[] {
  return ['gameboy', 'vectrex', 'c64'];
}

export function chipLabel(id: ChipId): string {
  return chipDefinition(id).label;
}

/** First channel id that can play this instrument kind on the chip. */
export function auditionChannelId(chip: ChipId, kind: InstrumentKind): string {
  const definition = chipDefinition(chip);
  const match = definition.channels.find((channel) => definition.kindsForChannel(channel.id).includes(kind));
  return match?.id ?? definition.channels[0].id;
}

export function auditionChannelIndex(chip: ChipId, kind: InstrumentKind): number {
  const definition = chipDefinition(chip);
  const id = auditionChannelId(chip, kind);
  return Math.max(0, definition.channels.findIndex((channel) => channel.id === id));
}

export { baseInstrument };
