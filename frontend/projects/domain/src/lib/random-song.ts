import { chipDefinition } from './chips';
import { newProject, songForRender } from './song-factory';
import type { ChipId, Pattern, Project, Song } from './types';
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
 * Scatter notes into an existing pattern. Mutates `pattern.rows`.
 * Uses the given instrument id on every written cell.
 */
export function fillPatternRandom(pattern: Pattern, chip: ChipId, instrumentId: string, seed: number): void {
  const random = mulberry32(seed);
  const channelCount = chipDefinition(chip).channels.length;
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72];
  for (let channel = 0; channel < channelCount; channel += 1) {
    for (let row = 0; row < PATTERN_ROWS; row += 1) {
      if (random() > 0.55) {
        continue;
      }
      const note = pitches[Math.floor(random() * pitches.length)] - channel * 12;
      pattern.rows[row][channel] = {
        note,
        cut: false,
        instrumentId,
        volume: 8 + Math.floor(random() * 8),
        effect: null,
      };
    }
  }
}

/** One song, default instrument, notes scattered on every channel the chip has. */
export function randomProject(chip: ChipId, seed: number): Project {
  const project = newProject(chip, 'Random');
  const body = project.songs[0];
  fillPatternRandom(body.patterns[0], chip, project.armedInstrumentId, seed);
  return project;
}

/**
 * Flat render view of a random project. Kept for deterministic tests that still use Song.
 */
export function randomSong(chip: ChipId, seed: number): Song {
  return songForRender(randomProject(chip, seed));
}
