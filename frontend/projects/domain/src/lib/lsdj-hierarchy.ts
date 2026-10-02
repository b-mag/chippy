import {
  PATTERN_ROWS,
  type Cell,
  type EffectCmd,
  type Pattern,
  type SongBody,
} from './types';

function emptyCell(): Cell {
  return { note: null, cut: false, instrumentId: null, volume: null, effect: null };
}

/** LSDJ chain / phrase / table / groove constants. */
export const LSDJ_CHAIN_LENGTH = 16;
export const LSDJ_PHRASE_LENGTH = PATTERN_ROWS;
export const LSDJ_MAX_CHAINS = 128;
export const LSDJ_MAX_PHRASES = 255;
export const LSDJ_GROOVE_COUNT = 31;
export const LSDJ_GROOVE_LENGTH = 16;
export const LSDJ_TABLE_COUNT = 32;
export const LSDJ_TABLE_LENGTH = 16;
export const LSDJ_SEQUENCE_ROWS = 256;
export const LSDJ_CHANNELS = 4;

/** LSDJ channel labels in Song-screen column order. */
export const LSDJ_CHANNEL_LABELS = ['PU1', 'PU2', 'WAV', 'NOI'] as const;

/**
 * One phrase: 16 steps of a single channel, stored at its LSDJ slot index (0–254).
 * Phrases are channel-agnostic byte-wise; the channel comes from the chain that plays them.
 */
export interface LsdjPhrase {
  index: number;
  steps: Cell[];
}

/** One step in a chain: a phrase slot plus a signed semitone transpose. */
export interface LsdjChainStep {
  phrase: number | null;
  transpose: number;
}

/** One chain at its LSDJ slot index (0–127). */
export interface LsdjChain {
  index: number;
  steps: LsdjChainStep[];
}

/** One row of an LSDJ instrument table. */
export interface LsdjTableStep {
  envelope: number;
  /** Stored as unsigned byte (LSDJ layout); interpret as signed when applying. */
  transpose: number;
  cmd1: EffectCmd | null;
  cmd1Value: number;
  cmd2: EffectCmd | null;
  cmd2Value: number;
}

/** One table at its LSDJ slot index (0–31). */
export interface LsdjTable {
  index: number;
  steps: LsdjTableStep[];
}

/**
 * Which chain and chain step the Chain and Phrase screens are showing.
 * The channel and phrase row come from the session cursor, so the three screens
 * cascade: Song cell → chain, chain step → phrase.
 */
export interface LsdjFocus {
  songRow: number;
  chainStep: number;
}

/**
 * Game Boy LSDJ hierarchy. Whenever this is present it is canonical:
 * `SongBody.order` / `patterns` are a derived flat projection used for playback,
 * export to non-LSDJ formats, and the flat grid when LSDJ mode is switched off.
 * `enabled` is a view flag only — turning it off never discards hierarchy data.
 */
export interface LsdjHierarchy {
  enabled: boolean;
  phrases: LsdjPhrase[];
  chains: LsdjChain[];
  /** `[channel][songRow]` chain slot, or null for an empty cell. */
  sequence: (number | null)[][];
  /** Up to 31 grooves × 16 steps (0 = end of groove). */
  grooves: number[][];
  tables: LsdjTable[];
  activeGroove: number;
  focus: LsdjFocus;
}

/** One 16-row block of a channel's timeline, resolved from sequence → chain → phrase. */
export interface LsdjFlatSlot {
  phrase: number;
  transpose: number;
  songRow: number;
  chain: number;
  chainStep: number;
}

export interface DerivedOrderEntry {
  slotKey: string;
  patternId: string;
  patternName: string;
  /** Distinct phrase slots referenced by this flat block, lowest channel first. */
  phrases: number[];
  /** True when any phrase in this block is played more than once in the song. */
  shared: boolean;
}

export function lsdjHex(value: number, digits = 2): string {
  return Math.max(0, Math.round(value)).toString(16).toUpperCase().padStart(digits, '0');
}

/** Parse 1–2 hex digits; returns null for empty or malformed input. */
export function parseLsdjHex(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || !/^[0-9a-fA-F]{1,2}$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 16);
}

export function emptyPhraseSteps(): Cell[] {
  return Array.from({ length: LSDJ_PHRASE_LENGTH }, () => emptyCell());
}

export function blankLsdjPhrase(index: number): LsdjPhrase {
  return { index, steps: emptyPhraseSteps() };
}

export function blankChainSteps(): LsdjChainStep[] {
  return Array.from({ length: LSDJ_CHAIN_LENGTH }, () => ({ phrase: null, transpose: 0 }));
}

export function blankLsdjChain(index: number): LsdjChain {
  return { index, steps: blankChainSteps() };
}

export function blankTableStep(): LsdjTableStep {
  return { envelope: 0, transpose: 0, cmd1: null, cmd1Value: 0, cmd2: null, cmd2Value: 0 };
}

export function blankLsdjTable(index: number): LsdjTable {
  return {
    index,
    steps: Array.from({ length: LSDJ_TABLE_LENGTH }, () => blankTableStep()),
  };
}

export function defaultGrooves(): number[][] {
  const grooves: number[][] = [];
  for (let g = 0; g < LSDJ_GROOVE_COUNT; g += 1) {
    const steps = Array.from({ length: LSDJ_GROOVE_LENGTH }, () => 0);
    if (g === 0) {
      steps[0] = 6;
      steps[1] = 6;
    }
    grooves.push(steps);
  }
  return grooves;
}

export function emptySequence(): (number | null)[][] {
  return Array.from({ length: LSDJ_CHANNELS }, () =>
    Array.from({ length: LSDJ_SEQUENCE_ROWS }, () => null),
  );
}

function cloneCell(cell: Cell): Cell {
  return { ...cell, effect: cell.effect ? { ...cell.effect } : null };
}

function cloneSteps(steps: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < LSDJ_PHRASE_LENGTH; i += 1) {
    out.push(steps[i] ? cloneCell(steps[i]) : emptyCell());
  }
  return out;
}

export function padChainSteps(steps: LsdjChainStep[]): LsdjChainStep[] {
  const out: LsdjChainStep[] = [];
  for (let i = 0; i < LSDJ_CHAIN_LENGTH; i += 1) {
    const step = steps[i];
    out.push(step ? { phrase: step.phrase, transpose: step.transpose | 0 } : { phrase: null, transpose: 0 });
  }
  return out;
}

export function padTableSteps(steps: LsdjTableStep[]): LsdjTableStep[] {
  return Array.from({ length: LSDJ_TABLE_LENGTH }, (_, i) => ({ ...blankTableStep(), ...steps[i] }));
}

export function findPhrase(hierarchy: LsdjHierarchy, index: number | null): LsdjPhrase | null {
  if (index === null) {
    return null;
  }
  return hierarchy.phrases.find((phrase) => phrase.index === index) ?? null;
}

export function findChain(hierarchy: LsdjHierarchy, index: number | null): LsdjChain | null {
  if (index === null) {
    return null;
  }
  return hierarchy.chains.find((chain) => chain.index === index) ?? null;
}

export function findTable(hierarchy: LsdjHierarchy, index: number | null): LsdjTable | null {
  if (index === null) {
    return null;
  }
  return hierarchy.tables.find((table) => table.index === index) ?? null;
}

export function chainAt(hierarchy: LsdjHierarchy, channel: number, songRow: number): number | null {
  return hierarchy.sequence[channel]?.[songRow] ?? null;
}

/**
 * Rows to show on the Song screen: every used row plus one blank landing row.
 * Grows as the user fills rows instead of showing all 256 up front.
 */
export function songRowCount(hierarchy: LsdjHierarchy): number {
  let last = -1;
  for (let channel = 0; channel < LSDJ_CHANNELS; channel += 1) {
    const rows = hierarchy.sequence[channel] ?? [];
    for (let row = rows.length - 1; row > last; row -= 1) {
      if (rows[row] !== null && rows[row] !== undefined) {
        last = row;
        break;
      }
    }
  }
  return Math.min(LSDJ_SEQUENCE_ROWS, Math.max(1, last + 2));
}

export function nextFreePhraseIndex(hierarchy: LsdjHierarchy): number | null {
  const used = new Set(hierarchy.phrases.map((phrase) => phrase.index));
  for (let index = 0; index < LSDJ_MAX_PHRASES; index += 1) {
    if (!used.has(index)) {
      return index;
    }
  }
  return null;
}

export function nextFreeChainIndex(hierarchy: LsdjHierarchy): number | null {
  const used = new Set(hierarchy.chains.map((chain) => chain.index));
  for (let index = 0; index < LSDJ_MAX_CHAINS; index += 1) {
    if (!used.has(index)) {
      return index;
    }
  }
  return null;
}

export function nextFreeTableIndex(hierarchy: LsdjHierarchy): number | null {
  const used = new Set(hierarchy.tables.map((table) => table.index));
  for (let index = 0; index < LSDJ_TABLE_COUNT; index += 1) {
    if (!used.has(index)) {
      return index;
    }
  }
  return null;
}

/**
 * Resolve each channel's timeline of 16-row blocks.
 * A chain ends at its first empty step, matching LSDJ playback.
 */
export function channelFlatSlots(hierarchy: LsdjHierarchy): LsdjFlatSlot[][] {
  const perChannel: LsdjFlatSlot[][] = [];
  for (let channel = 0; channel < LSDJ_CHANNELS; channel += 1) {
    const slots: LsdjFlatSlot[] = [];
    const rows = hierarchy.sequence[channel] ?? [];
    for (let songRow = 0; songRow < rows.length; songRow += 1) {
      const chainIndex = rows[songRow];
      if (chainIndex === null || chainIndex === undefined) {
        continue;
      }
      const chain = findChain(hierarchy, chainIndex);
      if (!chain) {
        continue;
      }
      for (let chainStep = 0; chainStep < chain.steps.length; chainStep += 1) {
        const step = chain.steps[chainStep];
        if (step?.phrase === null || step?.phrase === undefined) {
          break;
        }
        slots.push({
          phrase: step.phrase,
          transpose: step.transpose | 0,
          songRow,
          chain: chainIndex,
          chainStep,
        });
      }
    }
    perChannel.push(slots);
  }
  return perChannel;
}

/** How many times each phrase slot is played across the whole song. */
export function phraseUseCounts(hierarchy: LsdjHierarchy): Map<number, number> {
  const counts = new Map<number, number>();
  for (const slots of channelFlatSlots(hierarchy)) {
    for (const slot of slots) {
      counts.set(slot.phrase, (counts.get(slot.phrase) ?? 0) + 1);
    }
  }
  return counts;
}

function transposedCell(cell: Cell, transpose: number): Cell {
  const next = cloneCell(cell);
  if (next.note !== null && !next.cut && transpose !== 0) {
    next.note = Math.min(127, Math.max(0, next.note + transpose));
  }
  return next;
}

function flatPatternId(index: number): string {
  return `flat-${index + 1}`;
}

/**
 * Rebuild flat `order` + `patterns` from the hierarchy.
 * Block N of the flat timeline merges each channel's Nth phrase into one 4-wide pattern,
 * with chain transpose baked in so playback and non-LSDJ exports hear the real pitches.
 */
export function syncFlatProjection(body: SongBody): SongBody {
  const hierarchy = body.lsdj;
  if (!hierarchy) {
    return body;
  }
  const perChannel = channelFlatSlots(hierarchy);
  const blockCount = Math.max(1, ...perChannel.map((slots) => slots.length));
  const order: string[] = [];
  const patterns: Pattern[] = [];

  for (let block = 0; block < blockCount; block += 1) {
    const id = flatPatternId(block);
    const rows: Cell[][] = Array.from({ length: LSDJ_PHRASE_LENGTH }, () =>
      Array.from({ length: LSDJ_CHANNELS }, () => emptyCell()),
    );
    for (let channel = 0; channel < LSDJ_CHANNELS; channel += 1) {
      const slot = perChannel[channel][block];
      if (!slot) {
        continue;
      }
      const phrase = findPhrase(hierarchy, slot.phrase);
      if (!phrase) {
        continue;
      }
      for (let row = 0; row < LSDJ_PHRASE_LENGTH; row += 1) {
        rows[row][channel] = transposedCell(phrase.steps[row] ?? emptyCell(), slot.transpose);
      }
    }
    order.push(id);
    patterns.push({ id, name: `Block ${lsdjHex(block)}`, rows });
  }

  return { ...body, order, patterns };
}

/** Flat-grid metadata for the Song Order rail when LSDJ mode is off. */
export function derivedOrderEntries(hierarchy: LsdjHierarchy): DerivedOrderEntry[] {
  const perChannel = channelFlatSlots(hierarchy);
  const counts = phraseUseCounts(hierarchy);
  const blockCount = Math.max(1, ...perChannel.map((slots) => slots.length));
  const entries: DerivedOrderEntry[] = [];
  for (let block = 0; block < blockCount; block += 1) {
    const phrases: number[] = [];
    for (let channel = 0; channel < LSDJ_CHANNELS; channel += 1) {
      const slot = perChannel[channel][block];
      if (slot && !phrases.includes(slot.phrase)) {
        phrases.push(slot.phrase);
      }
    }
    entries.push({
      slotKey: `block-${block}`,
      patternId: flatPatternId(block),
      patternName: `Block ${lsdjHex(block)}`,
      phrases,
      shared: phrases.some((phrase) => (counts.get(phrase) ?? 0) > 1),
    });
  }
  return entries;
}

/** Locate the phrase step behind a flat-grid cell so edits land on the shared phrase. */
export function flatCellTarget(
  hierarchy: LsdjHierarchy,
  block: number,
  channel: number,
): { phrase: number; transpose: number } | null {
  const slot = channelFlatSlots(hierarchy)[channel]?.[block];
  return slot ? { phrase: slot.phrase, transpose: slot.transpose } : null;
}

function cellSignature(cell: Cell): string {
  return [
    cell.note ?? '-',
    cell.cut ? 'x' : '-',
    cell.instrumentId ?? '-',
    cell.volume ?? '-',
    cell.effect ? `${cell.effect.cmd}${cell.effect.value}` : '-',
  ].join('|');
}

function phraseSignature(steps: Cell[]): string {
  return steps.map(cellSignature).join(';');
}

function stepsAreEmpty(steps: Cell[]): boolean {
  return steps.every((cell) => cell.note === null && !cell.cut && cell.effect === null);
}

interface ExpansionPlan {
  phrases: LsdjPhrase[];
  chains: LsdjChain[];
  sequence: (number | null)[][];
  overflow: 'phrases' | 'chains' | null;
}

/**
 * Plan a flat → hierarchy expansion. Each channel column of each order slot becomes one
 * phrase (deduplicated within the channel), packed into chains of 16.
 */
function planExpansion(body: SongBody, channelCount: number): ExpansionPlan {
  const phrases: LsdjPhrase[] = [];
  const chains: LsdjChain[] = [];
  const sequence = emptySequence();
  const usableChannels = Math.min(Math.max(1, channelCount), LSDJ_CHANNELS);
  let overflow: 'phrases' | 'chains' | null = null;
  let nextPhrase = 0;
  let nextChain = 0;

  for (let channel = 0; channel < usableChannels; channel += 1) {
    const bySignature = new Map<string, number>();
    const channelPhrases: (number | null)[] = [];

    for (const patternId of body.order) {
      const pattern = body.patterns.find((item) => item.id === patternId);
      const steps = cloneSteps((pattern?.rows ?? []).map((row) => row[channel] ?? emptyCell()));
      if (stepsAreEmpty(steps)) {
        channelPhrases.push(null);
        continue;
      }
      const signature = phraseSignature(steps);
      const existing = bySignature.get(signature);
      if (existing !== undefined) {
        channelPhrases.push(existing);
        continue;
      }
      if (nextPhrase >= LSDJ_MAX_PHRASES) {
        overflow = 'phrases';
        channelPhrases.push(null);
        continue;
      }
      phrases.push({ index: nextPhrase, steps });
      bySignature.set(signature, nextPhrase);
      channelPhrases.push(nextPhrase);
      nextPhrase += 1;
    }

    while (channelPhrases.length > 0 && channelPhrases[channelPhrases.length - 1] === null) {
      channelPhrases.pop();
    }
    // Interior gaps must stay allocated: an empty chain step ends the chain in LSDJ.
    for (let i = 0; i < channelPhrases.length; i += 1) {
      if (channelPhrases[i] !== null) {
        continue;
      }
      let blank = phrases.find((phrase) => stepsAreEmpty(phrase.steps));
      if (!blank) {
        if (nextPhrase >= LSDJ_MAX_PHRASES) {
          overflow = 'phrases';
          continue;
        }
        blank = blankLsdjPhrase(nextPhrase);
        phrases.push(blank);
        nextPhrase += 1;
      }
      channelPhrases[i] = blank.index;
    }

    for (let i = 0; i < channelPhrases.length; i += LSDJ_CHAIN_LENGTH) {
      if (nextChain >= LSDJ_MAX_CHAINS) {
        overflow = overflow ?? 'chains';
        break;
      }
      const chunk = channelPhrases.slice(i, i + LSDJ_CHAIN_LENGTH);
      chains.push({
        index: nextChain,
        steps: padChainSteps(chunk.map((phrase) => ({ phrase, transpose: 0 }))),
      });
      sequence[channel][i / LSDJ_CHAIN_LENGTH] = nextChain;
      nextChain += 1;
    }
  }

  if (phrases.length === 0) {
    phrases.push(blankLsdjPhrase(0));
  }
  if (chains.length === 0) {
    chains.push({
      index: 0,
      steps: padChainSteps([{ phrase: phrases[0].index, transpose: 0 }]),
    });
    for (let channel = 0; channel < usableChannels; channel += 1) {
      sequence[channel][0] = 0;
    }
  }

  return { phrases, chains, sequence, overflow };
}

/** Whether this flat song fits LSDJ's 255 phrase / 128 chain budget. */
export function canExpandFlatToHierarchy(
  body: SongBody,
  channelCount = LSDJ_CHANNELS,
): { ok: true } | { ok: false; reason: string } {
  if (body.lsdj) {
    return { ok: true };
  }
  const plan = planExpansion(body, channelCount);
  if (plan.overflow === 'phrases') {
    return { ok: false, reason: `Song needs more than ${LSDJ_MAX_PHRASES} LSDJ phrases.` };
  }
  if (plan.overflow === 'chains') {
    return { ok: false, reason: `Song needs more than ${LSDJ_MAX_CHAINS} LSDJ chains.` };
  }
  return { ok: true };
}

/** Build the hierarchy for a flat Chippy song the first time LSDJ mode is switched on. */
export function expandFlatToHierarchy(body: SongBody, channelCount = LSDJ_CHANNELS): SongBody {
  if (body.lsdj) {
    return setLsdjEnabled(body, true);
  }
  const plan = planExpansion(body, channelCount);
  const hierarchy: LsdjHierarchy = {
    enabled: true,
    phrases: plan.phrases,
    chains: plan.chains,
    sequence: plan.sequence,
    grooves: defaultGrooves(),
    tables: [blankLsdjTable(0)],
    activeGroove: 0,
    focus: { songRow: 0, chainStep: 0 },
  };
  return syncFlatProjection({ ...body, lsdj: hierarchy });
}

/**
 * Rebuild phrases/chains/sequence from the current flat order + patterns.
 * Used when the flat Song Order changes (add/remove/duplicate/reorder) while a
 * hierarchy already exists — otherwise Play would keep hearing the old hierarchy
 * and ignore the pattern the grid is showing.
 * Grooves, tables, and the enabled flag are preserved; phrase/chain slot numbers
 * are reassigned to fit the new arrangement.
 */
export function reexpandHierarchyFromFlat(
  body: SongBody,
  channelCount = LSDJ_CHANNELS,
): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const plan = planExpansion(body, channelCount);
  if (plan.overflow) {
    return syncFlatProjection(body);
  }
  const previous = body.lsdj;
  const hierarchy: LsdjHierarchy = {
    enabled: previous.enabled,
    phrases: plan.phrases,
    chains: plan.chains,
    sequence: plan.sequence,
    grooves: previous.grooves,
    tables: previous.tables,
    activeGroove: previous.activeGroove,
    focus: previous.focus,
  };
  return syncFlatProjection({ ...body, lsdj: hierarchy });
}

/** Toggle the LSDJ mode screens. Hierarchy data is kept either way. */
export function setLsdjEnabled(body: SongBody, enabled: boolean): SongBody {
  if (!body.lsdj) {
    return body;
  }
  return { ...body, lsdj: { ...body.lsdj, enabled } };
}

export function isLsdjMode(body: SongBody): boolean {
  return Boolean(body.lsdj?.enabled);
}

export function hasLsdjHierarchy(body: SongBody): boolean {
  return Boolean(body.lsdj);
}

function withHierarchy(body: SongBody, next: LsdjHierarchy): SongBody {
  return syncFlatProjection({ ...body, lsdj: next });
}

/** Move the Song → Chain selection that the Chain and Phrase screens follow. */
export function setHierarchyFocus(body: SongBody, patch: Partial<LsdjFocus>): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const focus = body.lsdj.focus;
  const next: LsdjFocus = {
    songRow: clamp(patch.songRow ?? focus.songRow, 0, LSDJ_SEQUENCE_ROWS - 1),
    chainStep: clamp(patch.chainStep ?? focus.chainStep, 0, LSDJ_CHAIN_LENGTH - 1),
  };
  return { ...body, lsdj: { ...body.lsdj, focus: next } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** The chain the Chain screen is showing, following the Song screen cursor. */
export function focusedChainIndex(hierarchy: LsdjHierarchy, channel: number): number | null {
  return chainAt(hierarchy, channel, hierarchy.focus.songRow);
}

/** The phrase the Phrase screen is showing, following the Chain screen cursor. */
export function focusedPhraseIndex(hierarchy: LsdjHierarchy, channel: number): number | null {
  const chain = findChain(hierarchy, focusedChainIndex(hierarchy, channel));
  return chain?.steps[hierarchy.focus.chainStep]?.phrase ?? null;
}

/** Write a chain slot into a Song screen cell (null clears it). */
export function setSequenceCell(
  body: SongBody,
  channel: number,
  songRow: number,
  chain: number | null,
): SongBody {
  if (!body.lsdj || channel < 0 || channel >= LSDJ_CHANNELS) {
    return body;
  }
  if (songRow < 0 || songRow >= LSDJ_SEQUENCE_ROWS) {
    return body;
  }
  if (chain !== null && (chain < 0 || chain >= LSDJ_MAX_CHAINS)) {
    return body;
  }
  const sequence = body.lsdj.sequence.map((rows, index) =>
    index === channel ? rows.map((value, row) => (row === songRow ? chain : value)) : rows,
  );
  let chains = body.lsdj.chains;
  if (chain !== null && !chains.some((item) => item.index === chain)) {
    chains = [...chains, blankLsdjChain(chain)].sort((a, b) => a.index - b.index);
  }
  return withHierarchy(body, { ...body.lsdj, sequence, chains });
}

/** Allocate the next free chain into a Song screen cell and focus it. */
export function allocateChainAt(body: SongBody, channel: number, songRow: number): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const existing = chainAt(body.lsdj, channel, songRow);
  if (existing !== null) {
    return setHierarchyFocus(body, { songRow });
  }
  const index = nextFreeChainIndex(body.lsdj);
  if (index === null) {
    return body;
  }
  return setHierarchyFocus(setSequenceCell(body, channel, songRow, index), {
    songRow,
    chainStep: 0,
  });
}

/** Write a chain step's phrase slot and/or transpose. */
export function setChainStep(
  body: SongBody,
  chainIndex: number,
  step: number,
  patch: { phrase?: number | null; transpose?: number },
): SongBody {
  if (!body.lsdj || step < 0 || step >= LSDJ_CHAIN_LENGTH) {
    return body;
  }
  const phrase = patch.phrase;
  if (phrase !== undefined && phrase !== null && (phrase < 0 || phrase >= LSDJ_MAX_PHRASES)) {
    return body;
  }
  let chains = body.lsdj.chains;
  if (!chains.some((item) => item.index === chainIndex)) {
    if (chainIndex < 0 || chainIndex >= LSDJ_MAX_CHAINS) {
      return body;
    }
    chains = [...chains, blankLsdjChain(chainIndex)].sort((a, b) => a.index - b.index);
  }
  chains = chains.map((chain) => {
    if (chain.index !== chainIndex) {
      return chain;
    }
    return {
      ...chain,
      steps: chain.steps.map((item, index) => {
        if (index !== step) {
          return item;
        }
        return {
          phrase: phrase !== undefined ? phrase : item.phrase,
          transpose: patch.transpose !== undefined ? clamp(patch.transpose, -128, 127) : item.transpose,
        };
      }),
    };
  });
  let phrases = body.lsdj.phrases;
  if (phrase !== undefined && phrase !== null && !phrases.some((item) => item.index === phrase)) {
    phrases = [...phrases, blankLsdjPhrase(phrase)].sort((a, b) => a.index - b.index);
  }
  return withHierarchy(body, { ...body.lsdj, chains, phrases });
}

/** Allocate the next free phrase into a chain step and focus it. */
export function allocatePhraseAt(body: SongBody, chainIndex: number, step: number): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const chain = findChain(body.lsdj, chainIndex);
  if (chain?.steps[step]?.phrase !== null && chain?.steps[step]?.phrase !== undefined) {
    return setHierarchyFocus(body, { chainStep: step });
  }
  const index = nextFreePhraseIndex(body.lsdj);
  if (index === null) {
    return body;
  }
  return setHierarchyFocus(setChainStep(body, chainIndex, step, { phrase: index }), {
    chainStep: step,
  });
}

/** Write one step of a phrase. Every chain that references it hears the change. */
export function writePhraseStep(
  body: SongBody,
  phraseIndex: number,
  step: number,
  cell: Cell,
): SongBody {
  if (!body.lsdj || step < 0 || step >= LSDJ_PHRASE_LENGTH) {
    return body;
  }
  if (phraseIndex < 0 || phraseIndex >= LSDJ_MAX_PHRASES) {
    return body;
  }
  let phrases = body.lsdj.phrases;
  if (!phrases.some((item) => item.index === phraseIndex)) {
    phrases = [...phrases, blankLsdjPhrase(phraseIndex)].sort((a, b) => a.index - b.index);
  }
  phrases = phrases.map((phrase) => {
    if (phrase.index !== phraseIndex) {
      return phrase;
    }
    return {
      ...phrase,
      steps: phrase.steps.map((item, index) => (index === step ? cloneCell(cell) : item)),
    };
  });
  return withHierarchy(body, { ...body.lsdj, phrases });
}

export function clearPhrase(body: SongBody, phraseIndex: number): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const phrases = body.lsdj.phrases.map((phrase) =>
    phrase.index === phraseIndex ? { ...phrase, steps: emptyPhraseSteps() } : phrase,
  );
  return withHierarchy(body, { ...body.lsdj, phrases });
}

/**
 * Write a flat-grid cell back onto the phrase that produced it, undoing chain transpose
 * so the stored phrase keeps its own pitch.
 */
export function writeFlatCell(
  body: SongBody,
  block: number,
  channel: number,
  row: number,
  cell: Cell,
): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const target = flatCellTarget(body.lsdj, block, channel);
  if (!target) {
    return body;
  }
  const stored = cloneCell(cell);
  if (stored.note !== null && !stored.cut && target.transpose !== 0) {
    stored.note = Math.min(127, Math.max(0, stored.note - target.transpose));
  }
  return writePhraseStep(body, target.phrase, row, stored);
}

export function updateHierarchyGroove(
  body: SongBody,
  grooveIndex: number,
  steps: number[],
): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const grooves = body.lsdj.grooves.map((groove, index) =>
    index === grooveIndex
      ? Array.from({ length: LSDJ_GROOVE_LENGTH }, (_, step) => (steps[step] ?? 0) & 0xff)
      : groove,
  );
  return { ...body, lsdj: { ...body.lsdj, grooves, activeGroove: grooveIndex } };
}

export function updateHierarchyTable(body: SongBody, table: LsdjTable): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const normalized: LsdjTable = { index: table.index, steps: padTableSteps(table.steps) };
  const tables = body.lsdj.tables.some((item) => item.index === table.index)
    ? body.lsdj.tables.map((item) => (item.index === table.index ? normalized : item))
    : [...body.lsdj.tables, normalized].sort((a, b) => a.index - b.index);
  return { ...body, lsdj: { ...body.lsdj, tables } };
}

export function addHierarchyTable(body: SongBody): SongBody {
  if (!body.lsdj) {
    return body;
  }
  const index = nextFreeTableIndex(body.lsdj);
  if (index === null) {
    return body;
  }
  return {
    ...body,
    lsdj: {
      ...body.lsdj,
      tables: [...body.lsdj.tables, blankLsdjTable(index)].sort((a, b) => a.index - b.index),
    },
  };
}

export function signedTransposeByte(value: number): number {
  const byte = value & 0xff;
  return byte >= 128 ? byte - 256 : byte;
}

export function toTransposeByte(transpose: number): number {
  const clamped = clamp(transpose, -128, 127);
  return clamped < 0 ? clamped + 256 : clamped;
}
