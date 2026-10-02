import type { ChipId, EffectCmd } from './types';
import { effectCmdsForChip } from './types';

/** Short reference entry for an FX command on a chip. */
export interface EffectHelp {
  cmd: EffectCmd;
  name: string;
  summary: string;
  /** Shown when Web Audio preview does not (fully) honor the command. */
  previewNote?: string;
}

/** SHARED_EFFECT_CMDS is typed EffectCmd[], so key the maps by explicit subsets. */
type SharedEffectCmd = 'A' | 'U' | 'D' | 'R' | 'C' | 'P';
type LsdjEffectCmd =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'K' | 'L' | 'M' | 'O' | 'P' | 'R' | 'S' | 'T' | 'V' | 'W' | 'Z';

const SHARED_EFFECT_HELP: Record<SharedEffectCmd, EffectHelp> = {
  A: { cmd: 'A', name: 'Vol down', summary: 'Volume slide down by value each frame (0–F).' },
  U: { cmd: 'U', name: 'Vol up', summary: 'Volume slide up by value each frame (0–F).' },
  D: { cmd: 'D', name: 'Delay', summary: 'Delay note onset by value frames into the row (0–F).' },
  R: { cmd: 'R', name: 'Retrigger', summary: 'Re-gate the note every value frames (1–F).' },
  C: { cmd: 'C', name: 'Cut', summary: 'Cut the note after value frames (0 = first tick).' },
  P: { cmd: 'P', name: 'Pitch', summary: 'Pitch slide; low nibble 8 holds, else nudge MIDI each frame.' },
};

const LSDJ_PREVIEW_DEFERRED = 'Exports to .sav; live preview is approximate or silent until tables/grooves/synth land.';

const LSDJ_EFFECT_HELP: Record<LsdjEffectCmd, EffectHelp> = {
  A: {
    cmd: 'A',
    name: 'Table',
    summary: 'Run instrument table (high/low nibbles select speed and table).',
    previewNote: LSDJ_PREVIEW_DEFERRED,
  },
  B: { cmd: 'B', name: 'Vibrato', summary: 'Probabilistic mute / buzz from value (0–FF).' },
  C: { cmd: 'C', name: 'Chord', summary: 'Arp chord: high and low nibbles are semitone offsets.' },
  D: { cmd: 'D', name: 'Delay', summary: 'Delay the note by the low nibble of ticks.' },
  E: { cmd: 'E', name: 'Envelope', summary: 'Hardware envelope: high nibble volume, low nibble shape bits.' },
  F: {
    cmd: 'F',
    name: 'Frame',
    summary: 'Synth / wave frame select.',
    previewNote: LSDJ_PREVIEW_DEFERRED,
  },
  G: {
    cmd: 'G',
    name: 'Groove',
    summary: 'Select groove for swing / tick timing.',
    previewNote: LSDJ_PREVIEW_DEFERRED,
  },
  H: { cmd: 'H', name: 'Hop', summary: 'Jump in the phrase (0–F step, FF = stop, or hop-back form).' },
  K: { cmd: 'K', name: 'Kill', summary: 'Kill / cut after low-nibble ticks.' },
  L: { cmd: 'L', name: 'Slide', summary: 'Pitch slide toward the next note (signed-ish byte).' },
  M: { cmd: 'M', name: 'Master', summary: 'Master / channel volume from high nibble.' },
  O: {
    cmd: 'O',
    name: 'Pan',
    summary: 'Stereo pan (LSDJ output bits).',
    previewNote: LSDJ_PREVIEW_DEFERRED,
  },
  P: { cmd: 'P', name: 'Pitch', summary: 'Pitch bend speed (signed-ish byte).' },
  R: { cmd: 'R', name: 'Retrig', summary: 'Retrigger every low-nibble ticks.' },
  S: { cmd: 'S', name: 'Sweep', summary: 'Pulse sweep / kit speed from high nibble.' },
  T: {
    cmd: 'T',
    name: 'Tempo',
    summary: 'Tempo change (phrase tempo command).',
    previewNote: LSDJ_PREVIEW_DEFERRED,
  },
  V: { cmd: 'V', name: 'Tremolo', summary: 'Volume vibrato / tremolo depth from low nibble.' },
  W: { cmd: 'W', name: 'Wave', summary: 'Pulse duty / wave select (low bits).' },
  Z: { cmd: 'Z', name: 'Random', summary: 'Randomize pitch / stereo-ish chaos from value.' },
};

export function effectHelp(cmd: EffectCmd, chip: ChipId): EffectHelp | null {
  if (chip === 'gameboy') {
    return (LSDJ_EFFECT_HELP as Partial<Record<EffectCmd, EffectHelp>>)[cmd] ?? null;
  }
  return (SHARED_EFFECT_HELP as Partial<Record<EffectCmd, EffectHelp>>)[cmd] ?? null;
}

/** Ordered reference list for the active chip’s FX set. */
export function effectReferenceForChip(chip: ChipId): EffectHelp[] {
  return effectCmdsForChip(chip)
    .map((cmd) => effectHelp(cmd, chip))
    .filter((entry): entry is EffectHelp => entry !== null);
}

export function effectColumnHint(chip: ChipId): string {
  if (chip === 'gameboy') {
    return 'FX — LSDJ phrase cmd (letter) then two hex digits (00–FF). ? opens the list.';
  }
  return 'FX — A vol down, U vol up, D delay, R retrigger, C cut, P pitch (letter then hex value)';
}
