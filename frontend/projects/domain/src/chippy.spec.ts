import { describe, expect, it } from 'vitest';
import {
  activeSongBody,
  addSnipInstrument,
  channelIsPlaceholder,
  chipDefinition,
  confirmationAccepted,
  enterNote,
  formatNote,
  newProject,
  newSession,
  noteFromKey,
  randomSong,
  replaceWithRandom,
  songForRender,
} from '@chippy/domain';
import { ayPeriod, gbFrequency, renderSong } from '@chippy/engines';
import { AkyUnsupportedError, encodeAky, encodeVgm, encodeWav, encodeYm6, parseYm, renderPcm } from '@chippy/files';

describe('new project', () => {
  it('arms a default instrument on a 16-row pattern', () => {
    const song = songForRender(newProject('gameboy'));
    expect(song.instruments).toHaveLength(1);
    expect(song.armedInstrumentId).toBe(song.instruments[0].id);
    expect(song.patterns[0].rows).toHaveLength(16);
    expect(song.patterns[0].rows[0]).toHaveLength(4);
  });
});

describe('note entry', () => {
  it('writes the note, keeps the armed instrument, and moves down one row', () => {
    const start = newSession('gameboy');
    const midi = noteFromKey('z', start.octave);
    expect(midi).toBe(60);
    expect(formatNote(60)).toBe('C-4');
    const next = enterNote(start, midi!);
    expect(next.cursor.row).toBe(1);
    expect(activeSongBody(next.project).patterns[0].rows[0][0].note).toBe(60);
    expect(activeSongBody(next.project).patterns[0].rows[0][0].instrumentId).toBe(start.project.armedInstrumentId);
    expect(activeSongBody(start.project).patterns[0].rows[0][0].note).toBeNull();
  });
});

describe('random pattern fill', () => {
  it('fills one pattern from a known seed', () => {
    const first = randomSong('gameboy', 7);
    const second = randomSong('gameboy', 7);
    expect(first).toEqual(second);
    expect(first.patterns).toHaveLength(1);
    expect(first.patterns[0].name).toBe('Pattern 1');
    expect(first.patterns[0].rows).toHaveLength(16);
    const notes = first.patterns[0].rows.flat().filter((cell) => cell.note !== null);
    expect(notes.length).toBeGreaterThan(0);
    expect(randomSong('gameboy', 8)).not.toEqual(first);
  });

  it('fills FM channels and leaves placeholder channels empty', () => {
    for (const chip of ['genesis', 'pc98', 'x68000'] as const) {
      const song = randomSong(chip, 5);
      const definition = chipDefinition(chip);
      const rows = song.patterns[0].rows;
      definition.channels.forEach((_, index) => {
        const notes = rows.filter((row) => row[index].note !== null);
        if (channelIsPlaceholder(chip, index)) {
          expect(notes).toHaveLength(0);
          return;
        }
        expect(notes.length).toBeGreaterThan(0);
        notes.forEach((row) => {
          expect(row[index].note).toBeGreaterThanOrEqual(0);
          const instrument = song.instruments.find((item) => item.id === row[index].instrumentId);
          expect(instrument?.kind).toBe('fm');
        });
      });
    }
  });

  it('keeps replaceWithRandom gated on YES for legacy callers', () => {
    const start = newSession('vectrex');
    const blocked = replaceWithRandom(start, 3, 'yes');
    expect(blocked.project).toBe(start.project);
    expect(confirmationAccepted('YES')).toBe(true);
    const replaced = replaceWithRandom(start, 3, 'YES');
    expect(replaced.project.name).toBe('Random');
    expect(replaced.project).not.toBe(start.project);
  });
});

describe('snip', () => {
  it('does not change the open song until the instrument is added', () => {
    const project = newProject('vectrex');
    const before = project.instruments.length;
    const frames = [new Array(16).fill(0)];
    frames[0][0] = 0xd5;
    frames[0][8] = 12;
    const added = addSnipInstrument(project, 'Hit', frames);
    expect(project.instruments).toHaveLength(before);
    expect(added.project.instruments).toHaveLength(before + 1);
    expect(added.project.armedInstrumentId).toBe(added.instrumentId);
  });
});

describe('chip timing', () => {
  it('turns A4 into AY period 213 at 1.5 MHz', () => {
    expect(ayPeriod(69)).toBe(213);
  });

  it('renders a Vectrex note into the tone period registers', () => {
    const state = enterNote(newSession('vectrex'), 69);
    const rendered = renderSong(songForRender(state.project));
    expect(rendered.chip).toBe('vectrex');
    if (rendered.chip !== 'vectrex') {
      return;
    }
    const frame = rendered.frames[0];
    const period = frame[0] | ((frame[1] & 0x0f) << 8);
    expect(period).toBe(213);
    expect(frame[7] & 0x01).toBe(0);
  });

  it('keeps Game Boy frequencies inside the 11-bit register', () => {
    expect(gbFrequency(60)).toBeGreaterThan(0);
    expect(gbFrequency(60)).toBeLessThan(2048);
  });
});

describe('exports', () => {
  it('writes a YM6 header and rejects a file that is not YM', () => {
    const frames = [new Array(16).fill(0)];
    frames[0][0] = 213 & 0xff;
    frames[0][1] = 0;
    const bytes = encodeYm6(frames, 'Test');
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('YM6!');
    const parsed = parseYm(bytes);
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.clockHz).toBe(1_500_000);
    expect(() => parseYm(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toThrow(/YM5|YM6/);
  });

  it('writes a VGM header and a WAV header', () => {
    const state = enterNote(newSession('gameboy'), 60);
    const rendered = renderSong(songForRender(state.project));
    if (rendered.chip !== 'gameboy') {
      throw new Error('expected game boy');
    }
    const vgm = encodeVgm(rendered.frames, 'Test');
    expect(new TextDecoder().decode(vgm.subarray(0, 4))).toBe('Vgm ');
    const wav = encodeWav(renderPcm(rendered));
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    const energy = renderPcm(rendered).reduce((sum, sample) => sum + Math.abs(sample), 0);
    expect(energy).toBeGreaterThan(0);
  });

  it('encodes little-endian AKY bytes and rejects a hardware envelope', () => {
    const soft = [new Array(16).fill(0)];
    soft[0][0] = 213 & 0xff;
    soft[0][1] = 0;
    soft[0][7] = 0x3e;
    soft[0][8] = 12;
    const encoded = encodeAky(soft);
    expect(encoded.song).toContain('dc.b');
    expect(encoded.song).toContain('dc.b 129');
    expect(encoded.playerconfig).toContain('PLY_CFG_SoftOnly = 1');
    const hard = soft.map((frame) => frame.slice());
    hard[0][8] = 0x1c;
    expect(() => encodeAky(hard)).toThrow(AkyUnsupportedError);
  });
});
