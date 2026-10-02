import { describe, expect, it } from 'vitest';
import { enterNote, newSession, songForRender } from '@chippy/domain';
import { framesPerRow, renderSong } from '@chippy/engines';

describe('renderSong Game Boy LSDJ A/G preview', () => {
  it('applies table and groove commands without throwing', () => {
    const state = enterNote(newSession('gameboy'), 60);
    const song = songForRender(state.project);
    song.patterns[0].rows[0][0] = {
      ...song.patterns[0].rows[0][0],
      note: 60,
      effect: { cmd: 'A', value: 0x21 },
    };
    song.patterns[0].rows[1][0] = {
      ...song.patterns[0].rows[1][0],
      note: 62,
      effect: { cmd: 'G', value: 0x02 },
    };
    song.patterns[0].rows[2][0] = {
      ...song.patterns[0].rows[2][0],
      note: 64,
      effect: null,
    };
    const rendered = renderSong(song);
    expect(rendered.chip).toBe('gameboy');
    expect(rendered.frames.length).toBeGreaterThan(framesPerRow(song.tempo, 60) * 2);
  });
});
