import { describe, expect, it } from 'vitest';
import { enterNote, newProject, newSession, songForRender } from '@chippy/domain';
import { renderSong } from '@chippy/engines';
import {
  a4Hz,
  a4Period,
  downloadName,
  encodeYm6,
  exportAky,
  exportVgm,
  exportWav,
  exportYm,
  parseProject,
  parseYm,
  renderPcm,
  serializeProject,
} from '@chippy/files';
import type { AyFrame, GbFrame } from '@chippy/engines';

describe('project file', () => {
  it('round-trips a project, migrates v1, and rejects unknown fields', () => {
    const project = newProject('gameboy');
    const text = serializeProject(project);
    expect(parseProject(text).chip).toBe('gameboy');
    expect(parseProject(text).songs).toHaveLength(1);
    expect(() => parseProject('{')).toThrow(/JSON/);
    expect(() => parseProject('[]')).toThrow(/object/);
    expect(() => parseProject(JSON.stringify({ ...project, virus: true }))).toThrow(/Unknown/);
    expect(() => parseProject(JSON.stringify({ ...project, version: 99 }))).toThrow(/version/);
    expect(() => parseProject(JSON.stringify({ ...project, chip: 'c64' }))).toThrow(/chip/);
    expect(downloadName({ ...project, name: 'My Song!' }, 'json')).toBe('My-Song.json');
    expect(downloadName({ ...project, name: '!!!' }, 'json')).toBe('chippy.json');
    const legacy = {
      version: 1,
      name: 'Legacy',
      chip: 'gameboy',
      tempo: 120,
      order: ['pat-1'],
      patterns: [{ id: 'pat-1', rows: project.songs[0].patterns[0].rows }],
      instruments: project.instruments,
      armedInstrumentId: project.armedInstrumentId,
    };
    const migrated = parseProject(JSON.stringify(legacy));
    expect(migrated.version).toBe(2);
    expect(migrated.songs[0].patterns[0].name).toBe('Pattern 1');
    const v2 = parseProject(text);
    expect(parseProject(JSON.stringify({
      ...v2,
      songs: [{ id: 'song-1', name: 'A', tempo: 100, order: ['pat-1'], patterns: [{ id: 'pat-1', rows: project.songs[0].patterns[0].rows }] }],
      activeSongId: 'missing',
    })).activeSongId).toBe('song-1');
    expect(() => parseProject(JSON.stringify({
      version: 2,
      name: 'X',
      chip: 'gameboy',
      instruments: project.instruments,
      armedInstrumentId: project.armedInstrumentId,
      songs: [{ id: 'song-1', name: 'A', tempo: 120, order: [], patterns: [] }],
      activeSongId: 'song-1',
    }))).toThrow(/order|patterns/);
    expect(() => parseProject(JSON.stringify({
      version: 2,
      name: 'X',
      chip: 'gameboy',
      instruments: [],
      armedInstrumentId: 'ins-1',
      songs: v2.songs,
      activeSongId: v2.activeSongId,
    }))).toThrow(/instruments/);
  });
});

describe('export helpers', () => {
  it('exports wav and vgm for game boy', () => {
    const song = songForRender(enterNote(newSession('gameboy'), 60).project);
    const wav = exportWav(song);
    expect(wav.filename.endsWith('.wav')).toBe(true);
    expect(exportVgm(song).filename.endsWith('.vgm')).toBe(true);
    expect(() => exportYm(song)).toThrow(/Vectrex/);
    expect(() => exportAky(song)).toThrow(/Vectrex/);
  });

  it('exports ym and aky for vectrex', () => {
    const song = songForRender(enterNote(newSession('vectrex'), 69).project);
    expect(exportYm(song).bytes[0]).toBe('Y'.charCodeAt(0));
    const aky = exportAky(song);
    expect(aky.songFile.filename.endsWith('.asm')).toBe(true);
    expect(aky.configFile.filename).toContain('playerconfig');
    expect(() => exportVgm(song)).toThrow(/Game Boy/);
    expect(renderSong(song).chip).toBe('vectrex');
  });

  it('covers pcm edge paths and ym parse errors', () => {
    expect(a4Period()).toBeGreaterThan(0);
    expect(a4Hz()).toBeCloseTo(440, 5);
    expect(() => encodeYm6([], 'x')).toThrow(/no frames/);
    const ay: AyFrame = new Array(16).fill(0);
    ay[7] = 0x38;
    ay[0] = 100;
    ay[8] = 0x1c;
    const vectrexPcm = renderPcm({ chip: 'vectrex', frameRate: 50, framesPerRow: 1, frames: [ay] });
    expect(vectrexPcm.length).toBeGreaterThan(0);
    const gb: GbFrame = {
      nr10: 0, nr11: 0, nr12: 0, nr13: 0, nr14: 0,
      nr21: 0, nr22: 0, nr23: 0, nr24: 0,
      nr30: 0x80, nr32: 0, nr33: 0, nr34: 0,
      nr42: 0x80, nr43: 0, nr44: 0x80,
      wave: new Array(32).fill(8),
    };
    expect(renderPcm({ chip: 'gameboy', frameRate: 60, framesPerRow: 1, frames: [gb] }).length).toBeGreaterThan(0);
    const bytes = encodeYm6([ay], 'Solo');
    expect(parseYm(bytes).name).toBe('Solo');
    const withDigi = Uint8Array.from(bytes);
    // After YM6!LeOnArD! + title\0 + author\0 + comment\0 + frameCount(4) + songAttr(4) sits digidrums(2).
    let cursor = 12;
    while (cursor < withDigi.length && withDigi[cursor] !== 0) cursor += 1;
    cursor += 1;
    while (cursor < withDigi.length && withDigi[cursor] !== 0) cursor += 1;
    cursor += 1;
    while (cursor < withDigi.length && withDigi[cursor] !== 0) cursor += 1;
    cursor += 1 + 4 + 4;
    withDigi[cursor] = 0;
    withDigi[cursor + 1] = 1;
    expect(() => parseYm(withDigi)).toThrow(/digidrums/);
    expect(() => parseYm(new Uint8Array([...'YM6!NOTLEON!'.split('').map((c) => c.charCodeAt(0))]))).toThrow(/check string/);
    expect(() => parseYm(bytes.subarray(0, 40))).toThrow();
  });
});
