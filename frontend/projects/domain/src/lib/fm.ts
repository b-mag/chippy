import type { FmOperator, FmPatch, Instrument } from './types';

/** Dotted keys the instrument editor uses for top-level FM controls. */
export type FmPatchFieldKey =
  | 'fm.algorithm'
  | 'fm.feedback'
  | 'fm.ams'
  | 'fm.pms'
  | 'fm.lfoEnable'
  | 'fm.lfoFrequency';

export const FM_OPERATOR_COUNT = 4;

export interface FmOperatorFieldSpec {
  key: keyof FmOperator;
  /** Column heading in the operator grid. */
  label: string;
  title: string;
  min: number;
  max: number;
}

/** Operator grid columns, in the order the modal lays them out. */
export const FM_OPERATOR_FIELDS: FmOperatorFieldSpec[] = [
  { key: 'ar', label: 'AR', title: 'Attack rate', min: 0, max: 31 },
  { key: 'dr', label: 'DR', title: 'First decay rate', min: 0, max: 31 },
  { key: 'sr', label: 'SR', title: 'Second decay (sustain) rate', min: 0, max: 31 },
  { key: 'rr', label: 'RR', title: 'Release rate', min: 0, max: 15 },
  { key: 'sl', label: 'SL', title: 'Sustain level (15 is near silence)', min: 0, max: 15 },
  { key: 'tl', label: 'TL', title: 'Total level (0 is loudest)', min: 0, max: 127 },
  { key: 'mul', label: 'MUL', title: 'Frequency multiple (0 means one half)', min: 0, max: 15 },
  { key: 'dt', label: 'DT', title: 'Detune', min: 0, max: 7 },
  { key: 'ks', label: 'KS', title: 'Key scale / rate scaling', min: 0, max: 3 },
  { key: 'ssgEg', label: 'SSG', title: 'SSG-EG mode (OPN family; 0 is off)', min: 0, max: 15 },
];

const OPERATOR_RANGES: Record<keyof FmOperator, { min: number; max: number }> = {
  dt: { min: 0, max: 7 },
  mul: { min: 0, max: 15 },
  tl: { min: 0, max: 127 },
  ks: { min: 0, max: 3 },
  ar: { min: 0, max: 31 },
  dr: { min: 0, max: 31 },
  sr: { min: 0, max: 31 },
  rr: { min: 0, max: 15 },
  sl: { min: 0, max: 15 },
  ssgEg: { min: 0, max: 15 },
};

const PATCH_RANGES: Record<Exclude<FmPatchFieldKey, 'fm.lfoEnable'>, { min: number; max: number }> = {
  'fm.algorithm': { min: 0, max: 7 },
  'fm.feedback': { min: 0, max: 7 },
  'fm.ams': { min: 0, max: 3 },
  'fm.pms': { min: 0, max: 7 },
  'fm.lfoFrequency': { min: 0, max: 7 },
};

export const FM_ALGORITHM_OPTIONS = [
  { value: 0, label: '0 · 1→2→3→4' },
  { value: 1, label: '1 · (1+2)→3→4' },
  { value: 2, label: '2 · 1+(2→3)→4' },
  { value: 3, label: '3 · (1→2)+3→4' },
  { value: 4, label: '4 · 1→2, 3→4' },
  { value: 5, label: '5 · 1→2, 1→3, 1→4' },
  { value: 6, label: '6 · 1→2, 3, 4' },
  { value: 7, label: '7 · all parallel' },
];

/**
 * Operator routing per algorithm, ops indexed 0-3 for slots 1-4.
 * `modulators[op]` lists the ops that phase-modulate it; `carriers` reach the output.
 */
export interface FmAlgorithmRouting {
  modulators: [number[], number[], number[], number[]];
  carriers: number[];
}

export const FM_ALGORITHMS: FmAlgorithmRouting[] = [
  { modulators: [[], [0], [1], [2]], carriers: [3] },
  { modulators: [[], [], [0, 1], [2]], carriers: [3] },
  { modulators: [[], [], [1], [0, 2]], carriers: [3] },
  { modulators: [[], [0], [], [1, 2]], carriers: [3] },
  { modulators: [[], [0], [], [2]], carriers: [1, 3] },
  { modulators: [[], [0], [0], [0]], carriers: [1, 2, 3] },
  { modulators: [[], [0], [], []], carriers: [1, 2, 3] },
  { modulators: [[], [], [], []], carriers: [0, 1, 2, 3] },
];

export function fmAlgorithmRouting(algorithm: number): FmAlgorithmRouting {
  return FM_ALGORITHMS[clampInt(algorithm, 0, 7)];
}

function clampInt(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/**
 * Default patch: algorithm 4 with two carrier/modulator pairs, so a fresh FM
 * instrument makes an audible, slightly bright tone before any editing.
 */
export function defaultFmPatch(): FmPatch {
  return {
    algorithm: 4,
    feedback: 4,
    ams: 0,
    pms: 0,
    lfoEnable: false,
    lfoFrequency: 4,
    operators: [
      { dt: 0, mul: 1, tl: 32, ks: 0, ar: 31, dr: 10, sr: 4, rr: 7, sl: 2, ssgEg: 0 },
      { dt: 0, mul: 1, tl: 8, ks: 0, ar: 31, dr: 8, sr: 3, rr: 7, sl: 2, ssgEg: 0 },
      { dt: 3, mul: 2, tl: 40, ks: 0, ar: 31, dr: 12, sr: 5, rr: 8, sl: 3, ssgEg: 0 },
      { dt: 0, mul: 1, tl: 12, ks: 0, ar: 31, dr: 9, sr: 3, rr: 8, sl: 2, ssgEg: 0 },
    ],
  };
}

function mergeOperator(base: FmOperator, raw: unknown): FmOperator {
  if (typeof raw !== 'object' || raw === null) {
    return { ...base };
  }
  const source = raw as Partial<Record<keyof FmOperator, unknown>>;
  const merged = { ...base };
  for (const key of Object.keys(OPERATOR_RANGES) as (keyof FmOperator)[]) {
    if (source[key] !== undefined) {
      const range = OPERATOR_RANGES[key];
      merged[key] = clampInt(source[key], range.min, range.max);
    }
  }
  return merged;
}

/**
 * Fill in and clamp a possibly partial FM patch (preset patch, loaded file, or
 * nothing at all) against the defaults.
 */
export function mergeFmPatch(raw: unknown): FmPatch {
  const base = defaultFmPatch();
  if (typeof raw !== 'object' || raw === null) {
    return base;
  }
  const source = raw as Partial<Record<string, unknown>>;
  const operatorsRaw = Array.isArray(source['operators']) ? (source['operators'] as unknown[]) : [];
  return {
    algorithm: clampInt(source['algorithm'] ?? base.algorithm, 0, 7),
    feedback: clampInt(source['feedback'] ?? base.feedback, 0, 7),
    ams: clampInt(source['ams'] ?? base.ams, 0, 3),
    pms: clampInt(source['pms'] ?? base.pms, 0, 7),
    lfoEnable: source['lfoEnable'] === undefined ? base.lfoEnable : Boolean(source['lfoEnable']),
    lfoFrequency: clampInt(source['lfoFrequency'] ?? base.lfoFrequency, 0, 7),
    operators: [
      mergeOperator(base.operators[0], operatorsRaw[0]),
      mergeOperator(base.operators[1], operatorsRaw[1]),
      mergeOperator(base.operators[2], operatorsRaw[2]),
      mergeOperator(base.operators[3], operatorsRaw[3]),
    ],
  };
}

/** Current value behind a dotted FM field key, for the editor controls. */
export function fmFieldValue(instrument: Instrument, key: FmPatchFieldKey): number | boolean {
  const patch = instrument.fm ?? defaultFmPatch();
  if (key === 'fm.lfoEnable') {
    return patch.lfoEnable;
  }
  if (key === 'fm.algorithm') return patch.algorithm;
  if (key === 'fm.feedback') return patch.feedback;
  if (key === 'fm.ams') return patch.ams;
  if (key === 'fm.pms') return patch.pms;
  return patch.lfoFrequency;
}

/** Instrument patch that changes one top-level FM field. */
export function patchFmField(
  instrument: Instrument,
  key: FmPatchFieldKey,
  value: number | boolean,
): Partial<Instrument> {
  const patch = mergeFmPatch(instrument.fm);
  if (key === 'fm.lfoEnable') {
    return { fm: { ...patch, lfoEnable: Boolean(value) } };
  }
  const range = PATCH_RANGES[key];
  const numeric = clampInt(value, range.min, range.max);
  if (key === 'fm.algorithm') return { fm: { ...patch, algorithm: numeric } };
  if (key === 'fm.feedback') return { fm: { ...patch, feedback: numeric } };
  if (key === 'fm.ams') return { fm: { ...patch, ams: numeric } };
  if (key === 'fm.pms') return { fm: { ...patch, pms: numeric } };
  return { fm: { ...patch, lfoFrequency: numeric } };
}

/** Instrument patch that changes one operator field. */
export function patchFmOperator(
  instrument: Instrument,
  index: number,
  key: keyof FmOperator,
  value: number,
): Partial<Instrument> {
  const patch = mergeFmPatch(instrument.fm);
  const slot = Math.min(FM_OPERATOR_COUNT - 1, Math.max(0, Math.round(index)));
  const range = OPERATOR_RANGES[key];
  const operators = patch.operators.map((operator, position) =>
    position === slot ? { ...operator, [key]: clampInt(value, range.min, range.max) } : operator,
  ) as FmPatch['operators'];
  return { fm: { ...patch, operators } };
}

export function isFmPatchFieldKey(key: string): key is FmPatchFieldKey {
  return key.startsWith('fm.');
}
