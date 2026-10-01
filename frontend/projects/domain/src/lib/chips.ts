import { FM_ALGORITHM_OPTIONS, mergeFmPatch, type FmPatchFieldKey } from './fm';
import type { ChipId, Instrument, InstrumentKind, InstrumentPatch } from './types';

/** Either a flat instrument property or a dotted FM patch field. */
export type InstrumentFieldKey = keyof Instrument | FmPatchFieldKey;

export interface InstrumentField {
  key: InstrumentFieldKey;
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
  /**
   * Hardware this chip has but Chippy does not drive yet. The column is shown
   * so the layout matches the real chip, but it takes no notes and makes no sound.
   */
  placeholder?: boolean;
  /** Why the column is inert, shown as a tooltip. */
  placeholderNote?: string;
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

function baseInstrument(partial: InstrumentPatch & Pick<Instrument, 'id' | 'name' | 'kind'>): Instrument {
  const { fm, ...rest } = partial;
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
    ...rest,
    // Presets and loaded files may carry a partial patch; fill the rest in.
    fm: mergeFmPatch(fm),
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

/** AY fields shared by Vectrex and Atari ST (YM2149). */
const ayFields: InstrumentField[] = [
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
];

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
  fields: ayFields,
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

function nesInstrument(kind: InstrumentKind): Instrument {
  if (kind === 'triangle') {
    return baseInstrument({ id: 'ins-1', name: 'Triangle', kind: 'triangle', envelopeStart: 15, envelopeDown: false, envelopePeriod: 0 });
  }
  if (kind === 'noise') {
    return baseInstrument({ id: 'ins-1', name: 'Noise', kind: 'noise', envelopeStart: 10, envelopePeriod: 2 });
  }
  return baseInstrument({ id: 'ins-1', name: 'Pulse lead', kind: 'pulse' });
}

const atarist: ChipDefinition = {
  id: 'atarist',
  label: 'Atari ST',
  /** YM2149 on the Atari ST is typically clocked at 2 MHz. Music frames are 50 Hz. */
  clockHz: 2_000_000,
  frameRate: 50,
  channels: [
    { id: 'tone1', label: 'Tone 1' },
    { id: 'tone2', label: 'Tone 2' },
    { id: 'tone3', label: 'Tone 3' },
  ],
  kinds: ['tone', 'snip'],
  fields: ayFields,
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

const nes: ChipDefinition = {
  id: 'nes',
  label: 'NES',
  /** NTSC 2A03 CPU clock; soft APU uses this for timer period math. */
  clockHz: 1_789_773,
  frameRate: 60,
  channels: [
    { id: 'pulse1', label: 'Pulse 1', alias: 'PU1' },
    { id: 'pulse2', label: 'Pulse 2', alias: 'PU2' },
    { id: 'triangle', label: 'Triangle', alias: 'TRI' },
    { id: 'noise', label: 'Noise', alias: 'NOI' },
  ],
  kinds: ['pulse', 'triangle', 'noise'],
  fields: [
    { key: 'duty', label: 'Duty', control: 'select', options: dutyOptions, kinds: ['pulse'] },
    { key: 'envelopeStart', label: 'Envelope level', control: 'knob', min: 0, max: 15, kinds: ['pulse', 'noise'] },
    { key: 'envelopeDown', label: 'Envelope falls', control: 'toggle', kinds: ['pulse', 'noise'] },
    { key: 'envelopePeriod', label: 'Envelope period', control: 'knob', min: 0, max: 7, kinds: ['pulse', 'noise'] },
    { key: 'noiseShort', label: 'Short noise', control: 'toggle', kinds: ['noise'] },
    { key: 'pitchMacro', label: 'Pitch macro', control: 'macro', min: -24, max: 24, kinds: ['pulse', 'triangle', 'noise'] },
    { key: 'volumeMacro', label: 'Volume macro', control: 'macro', min: 0, max: 15, kinds: ['pulse', 'noise'] },
  ],
  createDefaultInstrument() {
    return nesInstrument('pulse');
  },
  createInstrument(kind: InstrumentKind) {
    if (!this.kinds.includes(kind)) {
      return this.createDefaultInstrument();
    }
    return nesInstrument(kind);
  },
  kindsForChannel(channelId: string) {
    if (channelId === 'triangle') {
      return ['triangle'];
    }
    if (channelId === 'noise') {
      return ['noise'];
    }
    return ['pulse'];
  },
};

/**
 * Shared four-operator controls. The operator grid itself is driven by
 * `FM_OPERATOR_FIELDS`, so only the channel-wide values live here.
 */
const fmFields: InstrumentField[] = [
  { key: 'fm.algorithm', label: 'Algorithm', control: 'select', options: FM_ALGORITHM_OPTIONS, kinds: ['fm'] },
  { key: 'fm.feedback', label: 'Feedback', control: 'knob', min: 0, max: 7, kinds: ['fm'] },
  { key: 'fm.lfoEnable', label: 'LFO', control: 'toggle', kinds: ['fm'] },
  { key: 'fm.lfoFrequency', label: 'LFO speed', control: 'knob', min: 0, max: 7, kinds: ['fm'] },
  { key: 'fm.ams', label: 'AMS depth', control: 'knob', min: 0, max: 3, kinds: ['fm'] },
  { key: 'fm.pms', label: 'PMS depth', control: 'knob', min: 0, max: 7, kinds: ['fm'] },
  { key: 'volumeMacro', label: 'Volume macro', control: 'macro', min: 0, max: 15, kinds: ['fm'] },
  { key: 'pitchMacro', label: 'Pitch macro', control: 'macro', min: -24, max: 24, kinds: ['fm'] },
];

function fmInstrument(name: string): Instrument {
  return baseInstrument({ id: 'ins-1', name, kind: 'fm', envelopeStart: 15 });
}

function fmChannels(count: number): ChipChannel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fm${index + 1}`,
    label: `FM ${index + 1}`,
    alias: `FM${index + 1}`,
  }));
}

function placeholderChannel(id: string, label: string, alias: string, note: string): ChipChannel {
  return { id, label, alias, placeholder: true, placeholderNote: note };
}

/** Shared factory for the three four-operator chips. */
function fmChipDefinition(options: {
  id: ChipId;
  label: string;
  clockHz: number;
  fmChannelCount: number;
  defaultName: string;
  placeholders: ChipChannel[];
}): ChipDefinition {
  const channels = [...fmChannels(options.fmChannelCount), ...options.placeholders];
  return {
    id: options.id,
    label: options.label,
    clockHz: options.clockHz,
    frameRate: 60,
    channels,
    kinds: ['fm'],
    fields: fmFields,
    createDefaultInstrument() {
      return fmInstrument(options.defaultName);
    },
    createInstrument(kind: InstrumentKind) {
      if (!this.kinds.includes(kind)) {
        return this.createDefaultInstrument();
      }
      return fmInstrument(options.defaultName);
    },
    kindsForChannel(channelId: string) {
      const channel = channels.find((item) => item.id === channelId);
      if (!channel || channel.placeholder) {
        return [];
      }
      return ['fm'];
    },
  };
}

const genesis: ChipDefinition = fmChipDefinition({
  id: 'genesis',
  label: 'Sega Genesis',
  /** YM2612 on an NTSC Mega Drive runs at the 53.693175 MHz master clock / 7. */
  clockHz: 7_670_453,
  fmChannelCount: 6,
  defaultName: 'FM lead',
  placeholders: [
    placeholderChannel('psg1', 'PSG 1', 'PSG1', 'SN76489 PSG is not driven yet.'),
    placeholderChannel('psg2', 'PSG 2', 'PSG2', 'SN76489 PSG is not driven yet.'),
    placeholderChannel('psg3', 'PSG 3', 'PSG3', 'SN76489 PSG is not driven yet.'),
    placeholderChannel('psgnoise', 'PSG Noise', 'NOI', 'SN76489 noise is not driven yet.'),
  ],
});

const pc98: ChipDefinition = fmChipDefinition({
  id: 'pc98',
  label: 'NEC PC-98',
  /** YM2608 (OPNA) on a PC-9801 sound board is clocked at 7.987200 MHz. */
  clockHz: 7_987_200,
  fmChannelCount: 6,
  defaultName: 'OPNA lead',
  placeholders: [
    placeholderChannel('ssg1', 'SSG 1', 'SSG1', 'OPNA SSG is not driven yet.'),
    placeholderChannel('ssg2', 'SSG 2', 'SSG2', 'OPNA SSG is not driven yet.'),
    placeholderChannel('ssg3', 'SSG 3', 'SSG3', 'OPNA SSG is not driven yet.'),
    placeholderChannel('rhythm', 'Rhythm', 'RHY', 'OPNA rhythm samples are not driven yet.'),
    placeholderChannel('adpcm', 'ADPCM', 'PCM', 'OPNA ADPCM is not driven yet.'),
  ],
});

const x68000: ChipDefinition = fmChipDefinition({
  id: 'x68000',
  label: 'Sharp X68000',
  /** YM2151 (OPM) in an X68000 is clocked at 4 MHz. */
  clockHz: 4_000_000,
  fmChannelCount: 8,
  defaultName: 'OPM lead',
  placeholders: [
    placeholderChannel('adpcm', 'ADPCM', 'PCM', 'MSM6258 ADPCM is not driven yet.'),
  ],
});

const chips: Record<ChipId, ChipDefinition> = {
  gameboy,
  vectrex,
  c64,
  atarist,
  nes,
  genesis,
  pc98,
  x68000,
};

/** Chips whose voices come from the four-operator soft FM engine. */
const FM_CHIPS: ChipId[] = ['genesis', 'pc98', 'x68000'];

export function isFmChip(id: ChipId): boolean {
  return FM_CHIPS.includes(id);
}

export function chipDefinition(id: ChipId): ChipDefinition {
  return chips[id];
}

export function chipIds(): ChipId[] {
  return ['gameboy', 'vectrex', 'c64', 'atarist', 'nes', 'genesis', 'pc98', 'x68000'];
}

export function isChipId(value: unknown): value is ChipId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(chips, value);
}

/** Whether the column exists on the hardware but Chippy cannot play it yet. */
export function channelIsPlaceholder(chip: ChipId, channelIndex: number): boolean {
  return chipDefinition(chip).channels[channelIndex]?.placeholder === true;
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

/** Whether this instrument kind can sound on the given channel index. */
export function kindAllowedOnChannel(chip: ChipId, channelIndex: number, kind: InstrumentKind): boolean {
  const definition = chipDefinition(chip);
  const channel = definition.channels[channelIndex];
  if (!channel) {
    return false;
  }
  return definition.kindsForChannel(channel.id).includes(kind);
}

/**
 * Pick an instrument that can play on `channelIndex`.
 * Prefers the armed instrument when it matches; otherwise the first bank match.
 */
export function instrumentForChannel(
  chip: ChipId,
  instruments: Instrument[],
  armedInstrumentId: string,
  channelIndex: number,
): Instrument | undefined {
  const definition = chipDefinition(chip);
  const channel = definition.channels[channelIndex];
  if (!channel) {
    return undefined;
  }
  const allowed = definition.kindsForChannel(channel.id);
  const armed = instruments.find((item) => item.id === armedInstrumentId);
  if (armed && allowed.includes(armed.kind)) {
    return armed;
  }
  return instruments.find((item) => allowed.includes(item.kind));
}

export { baseInstrument };
