import { chipDefinition, instrumentForChannel } from './chips';
import { newProject, songForRender } from './song-factory';
import type { ChipId, Instrument, Pattern, Project, Song } from './types';
import { PATTERN_ROWS } from './types';

/** Deterministic generator so a test can demand a known pattern. */
export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ensure the project has at least one instrument for every channel kind.
 * Mutates and returns the same project reference when unchanged.
 */
export function ensureChannelInstruments(project: Project): Project {
  const definition = chipDefinition(project.chip);
  const needed = new Set<Instrument['kind']>();
  for (const channel of definition.channels) {
    const kinds = definition.kindsForChannel(channel.id);
    if (kinds.length > 0) {
      needed.add(kinds[0]);
    }
  }
  const missing = [...needed].filter((kind) => !project.instruments.some((item) => item.kind === kind));
  if (missing.length === 0) {
    return project;
  }
  const instruments = [...project.instruments];
  const used = new Set(instruments.map((item) => item.id));
  let nextIndex = instruments.length + 1;
  for (const kind of missing) {
    while (used.has(`ins-${nextIndex}`)) {
      nextIndex += 1;
    }
    const created = definition.createInstrument(kind);
    const id = `ins-${nextIndex}`;
    used.add(id);
    nextIndex += 1;
    instruments.push({ ...created, id, name: created.name });
  }
  return { ...project, instruments };
}

/**
 * Scatter notes into an existing pattern. Mutates `pattern.rows`.
 * Each channel uses an instrument whose kind is legal on that channel.
 */
export function fillPatternRandom(
  pattern: Pattern,
  chip: ChipId,
  instruments: Instrument[],
  armedInstrumentId: string,
  seed: number,
): void {
  const random = mulberry32(seed);
  const channelCount = chipDefinition(chip).channels.length;
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72];
  for (let channel = 0; channel < channelCount; channel += 1) {
    const instrument = instrumentForChannel(chip, instruments, armedInstrumentId, channel);
    if (!instrument) {
      continue;
    }
    for (let row = 0; row < PATTERN_ROWS; row += 1) {
      if (random() > 0.55) {
        continue;
      }
      const note = pitches[Math.floor(random() * pitches.length)] - channel * 12;
      pattern.rows[row][channel] = {
        note,
        cut: false,
        instrumentId: instrument.id,
        volume: 8 + Math.floor(random() * 8),
        effect: null,
      };
    }
  }
}

/** One song with channel-appropriate instruments and notes on every channel. */
export function randomProject(chip: ChipId, seed: number): Project {
  let project = ensureChannelInstruments(newProject(chip, 'Random'));
  const body = project.songs[0];
  fillPatternRandom(body.patterns[0], chip, project.instruments, project.armedInstrumentId, seed);
  return project;
}

/**
 * Flat render view of a random project. Kept for deterministic tests that still use Song.
 */
export function randomSong(chip: ChipId, seed: number): Song {
  return songForRender(randomProject(chip, seed));
}
