import { chipDefinition } from './chips';
import {
  PATTERN_ROWS,
  PROJECT_VERSION,
  type Cell,
  type ChipId,
  type Pattern,
  type Project,
  type Song,
  type SongBody,
} from './types';

export function emptyCell(): Cell {
  return { note: null, cut: false, instrumentId: null, volume: null, effect: null };
}

export function blankPattern(id: string, name = 'Pattern 1', channelCount = 4): Pattern {
  const channels = Math.max(1, channelCount);
  const rows: Cell[][] = [];
  for (let row = 0; row < PATTERN_ROWS; row += 1) {
    rows.push(Array.from({ length: channels }, () => emptyCell()));
  }
  return { id, name, rows };
}

export function blankSongBody(id = 'song-1', name = 'Song 1', channelCount = 4): SongBody {
  const pattern = blankPattern('pat-1', 'Pattern 1', channelCount);
  return {
    id,
    name,
    tempo: 120,
    order: [pattern.id],
    patterns: [pattern],
  };
}

/** A new project: one song, one pattern, one armed instrument. */
export function newProject(chip: ChipId, name = 'Untitled'): Project {
  const instrument = chipDefinition(chip).createDefaultInstrument();
  const channelCount = chipDefinition(chip).channels.length;
  const song = blankSongBody('song-1', 'Song 1', channelCount);
  return {
    version: PROJECT_VERSION,
    name,
    chip,
    instruments: [instrument],
    armedInstrumentId: instrument.id,
    songs: [song],
    activeSongId: song.id,
  };
}

export function activeSongBody(project: Project): SongBody {
  return project.songs.find((song) => song.id === project.activeSongId) ?? project.songs[0];
}

/** Flat view for engines, playback, and exports. */
export function songForRender(project: Project): Song {
  const body = activeSongBody(project);
  return {
    name: body.name,
    chip: project.chip,
    tempo: body.tempo,
    order: body.order,
    patterns: body.patterns,
    instruments: project.instruments,
    armedInstrumentId: project.armedInstrumentId,
  };
}

/**
 * Legacy flat Song document used by older tests and callers.
 * Prefer `newProject` for editable documents.
 */
export function newSong(chip: ChipId, name = 'Untitled'): Song {
  return songForRender(newProject(chip, name));
}

/** Replace the active song body inside a project. */
export function withActiveSong(project: Project, body: SongBody): Project {
  return {
    ...project,
    songs: project.songs.map((song) => (song.id === body.id ? body : song)),
    activeSongId: body.id,
  };
}
