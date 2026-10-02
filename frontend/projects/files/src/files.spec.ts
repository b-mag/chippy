import { describe, expect, it } from 'vitest';
import { enterNote, newProject, newSession, randomSong, songForRender, updateInstrument } from '@chippy/domain';
import { renderSong, type AyFrame, type GbFrame } from '@chippy/engines';
import {
  a4Hz,
  a4Period,
  decodeLsdjSav,
  downloadName,
  encodeLsdjSav,
  encodeYm6,
  exportAky,
  exportLsdjSav,
  exportVgm,
  exportWav,
  exportYm,
  instrumentDownloadName,
  LSDJ_GREENFIELD_FORMAT_VERSION,
  LSDJ_SAV_SIZE,
  lsdjImportMapAligned,
  lsdjSavCompatibilityStatus,
  parseInstrumentFile,
  parseProject,
  parseYm,
  projectFromLsdjDecode,
  renderPcm,
  serializeInstrumentFile,
  serializeProject,
  unwrapYmPayload,
} from '@chippy/files';
import { createEmptyLsdjSong } from './lib/lsdj-empty-song';

function sliceEqual(a: Uint8Array, b: Uint8Array, start: number, length: number): boolean {
  for (let i = 0; i < length; i += 1) {
    if (a[start + i] !== b[start + i]) {
      return false;
    }
  }
  return true;
}

/** Greenfield song dirtied with chain transpose, grooves, format, and file-slot markers. */
function dirtyLsdjSavFixture(): Uint8Array {
  const state = enterNote(newSession('gameboy'), 60);
  const song = songForRender(state.project);
  song.tempo = 145;
  song.patterns[0].rows[0][0] = {
    ...song.patterns[0].rows[0][0],
    effect: { cmd: 'C', value: 0x37 },
  };
  const bytes = encodeLsdjSav(song);
  // Non-default groove 0
  bytes[0x1090] = 5;
  bytes[0x1091] = 7;
  // Chain 0 step 0 transpose +12 (PU1); phrase note stays 60, heard as 72 after import
  bytes[0x2880] = 12;
  // Format version 9 (opened-cart style)
  bytes[0x7fff] = 9;
  // File-slot project name marker in upper 96KB
  bytes[0x8000] = 0x41; // 'A'
  // Table envelope marker (non-zero) so preserve can be asserted
  bytes[0x1690] = 0xab;
  return bytes;
}

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
    expect(() => parseProject(JSON.stringify({ ...project, chip: 'zx' }))).toThrow(/chip/);
    const c64 = newProject('c64');
    expect(parseProject(serializeProject(c64)).chip).toBe('c64');
    expect(parseProject(serializeProject(c64)).instruments[0].kind).toBe('sid');
    const atari = newProject('atarist');
    expect(parseProject(serializeProject(atari)).chip).toBe('atarist');
    const nes = newProject('nes');
    expect(parseProject(serializeProject(nes)).chip).toBe('nes');
    expect(parseProject(serializeProject(nes)).instruments[0].kind).toBe('pulse');
    const withFx = serializeProject(c64);
    const parsedFx = JSON.parse(withFx);
    parsedFx.songs[0].patterns[0].rows[0][0].effect = { cmd: 'D', value: 4 };
    expect(parseProject(JSON.stringify(parsedFx)).songs[0].patterns[0].rows[0][0].effect).toEqual({
      cmd: 'D',
      value: 4,
    });
    parsedFx.songs[0].patterns[0].rows[0][0].effect = { cmd: 'Z', value: 1 };
    expect(parseProject(JSON.stringify(parsedFx)).songs[0].patterns[0].rows[0][0].effect).toBeNull();
    for (const cmd of ['U', 'C', 'P'] as const) {
      parsedFx.songs[0].patterns[0].rows[0][0].effect = { cmd, value: 3 };
      expect(parseProject(JSON.stringify(parsedFx)).songs[0].patterns[0].rows[0][0].effect).toEqual({
        cmd,
        value: 3,
      });
    }
    // Game Boy accepts LSDJ FX (including Z) on v4.
    const gbFx = JSON.parse(serializeProject(project));
    gbFx.songs[0].patterns[0].rows[0][0].effect = { cmd: 'Z', value: 0x22 };
    expect(parseProject(JSON.stringify(gbFx)).songs[0].patterns[0].rows[0][0].effect).toEqual({
      cmd: 'Z',
      value: 0x22,
    });
    // v3 Game Boy remaps shared C cut → LSDJ K.
    const legacyGbFx = JSON.parse(serializeProject(project));
    legacyGbFx.version = 3;
    legacyGbFx.songs[0].patterns[0].rows[0][0].effect = { cmd: 'C', value: 2 };
    expect(parseProject(JSON.stringify(legacyGbFx)).songs[0].patterns[0].rows[0][0].effect).toEqual({
      cmd: 'K',
      value: 2,
    });
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
    expect(migrated.version).toBe(4);
    expect(migrated.customPresets).toEqual([]);
    expect(migrated.songs[0].patterns[0].name).toBe('Pattern 1');
    const v4 = parseProject(text);
    expect(v4.version).toBe(4);
    expect(v4.customPresets).toEqual([]);
    const asV2 = JSON.parse(text);
    asV2.version = 2;
    delete asV2.customPresets;
    const fromV2 = parseProject(JSON.stringify(asV2));
    expect(fromV2.version).toBe(4);
    expect(fromV2.customPresets).toEqual([]);
    expect(parseProject(JSON.stringify({
      ...v4,
      songs: [{ id: 'song-1', name: 'A', tempo: 100, order: ['pat-1'], patterns: [{ id: 'pat-1', rows: project.songs[0].patterns[0].rows }] }],
      activeSongId: 'missing',
    })).activeSongId).toBe('song-1');
    expect(() => parseProject(JSON.stringify({
      version: 4,
      name: 'X',
      chip: 'gameboy',
      instruments: project.instruments,
      armedInstrumentId: project.armedInstrumentId,
      songs: [{ id: 'song-1', name: 'A', tempo: 120, order: [], patterns: [] }],
      activeSongId: 'song-1',
      customPresets: [],
    }))).toThrow(/order|patterns/);
    expect(() => parseProject(JSON.stringify({
      version: 4,
      name: 'X',
      chip: 'gameboy',
      instruments: [],
      armedInstrumentId: 'ins-1',
      songs: v4.songs,
      activeSongId: v4.activeSongId,
      customPresets: [],
    }))).toThrow(/instruments/);
    const withCustom = {
      ...v4,
      customPresets: [{
        id: 'custom-1',
        name: 'My lead',
        chip: 'gameboy',
        kind: 'pulse',
        role: 'lead',
        patch: { duty: 1, envelopeStart: 10 },
      }],
    };
    expect(parseProject(JSON.stringify(withCustom)).customPresets[0].name).toBe('My lead');
  });
});

describe('instrument file', () => {
  it('round-trips an instrument and rejects bad shapes', () => {
    const project = newProject('nes');
    const instrument = project.instruments[0];
    const text = serializeInstrumentFile(instrument, 'nes', 'lead');
    const parsed = parseInstrumentFile(text);
    expect(parsed.name).toBe(instrument.name);
    expect(parsed.chip).toBe('nes');
    expect(parsed.kind).toBe(instrument.kind);
    expect(parsed.role).toBe('lead');
    expect(parsed.patch).not.toHaveProperty('id');
    expect(parsed.patch).not.toHaveProperty('name');
    expect(instrumentDownloadName('My Lead!')).toBe('My-Lead.chippy-instrument.json');
    expect(instrumentDownloadName('!!!')).toBe('instrument.chippy-instrument.json');
    expect(() => parseInstrumentFile('{')).toThrow(/JSON/);
    expect(() => parseInstrumentFile('[]')).toThrow(/object/);
    expect(() => parseInstrumentFile(JSON.stringify({ version: 1, type: 'other' }))).toThrow(/instrument file/i);
    expect(() => parseInstrumentFile(JSON.stringify({
      version: 99,
      type: 'chippy-instrument',
      name: 'X',
      chip: 'nes',
      kind: 'pulse',
      role: 'lead',
      patch: {},
    }))).toThrow(/version/);
    expect(() => parseInstrumentFile(JSON.stringify({
      version: 1,
      type: 'chippy-instrument',
      name: 'X',
      chip: 'zx',
      kind: 'pulse',
      role: 'lead',
      patch: {},
    }))).toThrow(/chip/);
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

  it('exports an LSDJ-compatible .sav for game boy', () => {
    const state = enterNote(newSession('gameboy'), 60);
    const song = songForRender(state.project);
    song.tempo = 145;
    song.patterns[0].rows[0][0] = {
      ...song.patterns[0].rows[0][0],
      effect: { cmd: 'C', value: 0x37 },
    };
    const bundle = exportLsdjSav(song);
    expect(bundle.filename.endsWith('.sav')).toBe(true);
    expect(bundle.bytes.length).toBe(LSDJ_SAV_SIZE);
    const bytes = encodeLsdjSav(song);
    expect(bytes.length).toBe(LSDJ_SAV_SIZE);
    // Work-song init markers "rb"
    expect(String.fromCharCode(bytes[0x1e78], bytes[0x1e79])).toBe('rb');
    expect(String.fromCharCode(bytes[0x3e80], bytes[0x3e81])).toBe('rb');
    expect(String.fromCharCode(bytes[0x7ff0], bytes[0x7ff1])).toBe('rb');
    // File-memory init "jk"
    expect(String.fromCharCode(bytes[0x8000 + 0x13e], bytes[0x8000 + 0x13f])).toBe('jk');
    expect(bytes[0x3fb4]).toBe(145);
    // Phrase 0 note / instrument / chord command
    expect(bytes[0x0000]).toBe(60);
    expect(bytes[0x7000]).toBe(0); // instrument 0
    expect(bytes[0x4000]).toBe(2); // LSDJ C
    expect(bytes[0x4ff0]).toBe(0x37);
    // Sequence row 0 has a chain on each channel
    expect(bytes[0x1290]).toBe(0);
    expect(bytes[0x1291]).toBe(1);
    expect(bytes[0x1292]).toBe(2);
    expect(bytes[0x1293]).toBe(3);
    expect(() => exportLsdjSav(songForRender(newSession('vectrex').project))).toThrow(/Game Boy/);
  });

  it('round-trips a game boy song through LSDJ .sav encode/decode', () => {
    const state = enterNote(newSession('gameboy'), 60);
    const song = songForRender(state.project);
    song.tempo = 145;
    song.patterns[0].rows[0][0] = {
      ...song.patterns[0].rows[0][0],
      effect: { cmd: 'C', value: 0x37 },
    };
    const bytes = encodeLsdjSav(song);
    const decoded = decodeLsdjSav(bytes);
    expect(decoded.song.chip).toBe('gameboy');
    expect(decoded.song.tempo).toBe(145);
    expect(decoded.song.order.length).toBeGreaterThanOrEqual(1);
    expect(decoded.song.patterns[0].rows[0][0].note).toBe(60);
    expect(decoded.song.patterns[0].rows[0][0].effect).toEqual({ cmd: 'C', value: 0x37 });
    expect(decoded.warnings.some((warning) => /tables|kits|speech/i.test(warning))).toBe(true);
    const project = projectFromLsdjDecode(decoded, 'cart');
    expect(project.chip).toBe('gameboy');
    expect(project.name).toBe('cart');
    expect(project.songs[0].tempo).toBe(145);
  });

  it('decodes an empty LSDJ .sav work song into a blank game boy project', () => {
    const blank = songForRender(newProject('gameboy'));
    const bytes = encodeLsdjSav(blank);
    const decoded = decodeLsdjSav(bytes);
    expect(decoded.song.chip).toBe('gameboy');
    expect(decoded.song.order.length).toBe(1);
    expect(decoded.song.patterns[0].rows.every((row) => row.every((cell) => cell.note === null))).toBe(true);
    expect(decoded.song.instruments.length).toBeGreaterThanOrEqual(1);
    expect(() => decodeLsdjSav(bytes.subarray(0, 32))).toThrow(/must be/);
  });

  it('decodes the vendored empty LSDJ template padded to a full .sav', () => {
    const bytes = new Uint8Array(LSDJ_SAV_SIZE);
    bytes.set(createEmptyLsdjSong(), 0);
    // Minimal file-memory init marker used by export.
    bytes[0x8000 + 0x13e] = 0x6a;
    bytes[0x8000 + 0x13f] = 0x6b;
    const decoded = decodeLsdjSav(bytes);
    expect(decoded.song.chip).toBe('gameboy');
    expect(decoded.song.order.length).toBe(1);
    expect(decoded.song.instruments.length).toBeGreaterThanOrEqual(1);
    expect(decoded.warnings.length).toBeGreaterThan(0);
    expect(decoded.formatVersion).toBe(LSDJ_GREENFIELD_FORMAT_VERSION);
    expect(decoded.importMap.channelPhrases).toHaveLength(4);
  });

  it('no-edit re-export of an opened .sav is byte-identical (identity invariant)', () => {
    const original = dirtyLsdjSavFixture();
    const decoded = decodeLsdjSav(original);
    expect(decoded.formatVersion).toBe(9);
    const exported = encodeLsdjSav(decoded.song, {
      baseSav: original,
      importMap: decoded.importMap,
      modified: false,
    });
    expect(exported).toEqual(original);
  });

  it('patch-in-place preserves chains/grooves/tables/file slots when editing', () => {
    const original = dirtyLsdjSavFixture();
    const decoded = decodeLsdjSav(original);
    expect(decoded.song.patterns[0].rows[0][0].note).toBe(72); // 60 + transpose 12
    decoded.song.patterns[0].rows[0][0] = {
      ...decoded.song.patterns[0].rows[0][0],
      note: 64,
      effect: { cmd: 'C', value: 0x11 },
    };
    decoded.song.tempo = 160;
    const exported = encodeLsdjSav(decoded.song, {
      baseSav: original,
      importMap: decoded.importMap,
      modified: true,
    });
    expect(exported).not.toEqual(original);
    // Structure + unsupported regions unchanged
    expect(sliceEqual(exported, original, 0x1290, 1024)).toBe(true); // sequence
    expect(sliceEqual(exported, original, 0x2080, 0x800)).toBe(true); // chain phrases
    expect(sliceEqual(exported, original, 0x2880, 0x800)).toBe(true); // chain transposes
    expect(sliceEqual(exported, original, 0x3e82, 32)).toBe(true); // phrase alloc
    expect(sliceEqual(exported, original, 0x3ea2, 16)).toBe(true); // chain alloc
    expect(exported[0x1090]).toBe(5);
    expect(exported[0x1091]).toBe(7);
    expect(exported[0x1690]).toBe(0xab);
    expect(exported[0x7fff]).toBe(9);
    expect(exported[0x8000]).toBe(0x41);
    // Phrase note stored without transpose: 64 - 12 = 52
    expect(exported[0x0000]).toBe(52);
    expect(exported[0x4000]).toBe(2); // C
    expect(exported[0x4ff0]).toBe(0x11);
    expect(exported[0x3fb4]).toBe(160);
    expect(lsdjImportMapAligned(decoded.song, decoded.importMap)).toBe(true);
  });

  it('reports LSDJ compatibility status for greenfield vs opened .sav', () => {
    const green = lsdjSavCompatibilityStatus({ baseSav: null });
    expect(green).toMatch(/Greenfield/i);
    expect(green).toMatch(/Still missing/i);
    const opened = lsdjSavCompatibilityStatus({
      baseSav: dirtyLsdjSavFixture(),
      structurePreserved: true,
    });
    expect(opened).toMatch(/Round-trip/i);
    expect(opened).toMatch(/preserved/i);
    expect(opened).toMatch(/Chains UI/i);
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

  it('rejects aky when vectrex noise or hardware envelope is used', () => {
    let state = newSession('vectrex');
    state = updateInstrument(state, state.project.armedInstrumentId, { mixNoise: true });
    state = enterNote(state, 69);
    expect(() => exportAky(songForRender(state.project))).toThrow(/YM6/);
    state = updateInstrument(state, state.project.armedInstrumentId, { mixNoise: false, hardwareEnvelope: true });
    expect(() => exportAky(songForRender(state.project))).toThrow(/YM6/);
  });

  it('exports wav for c64 soft SID', () => {
    const song = songForRender(enterNote(newSession('c64'), 60).project);
    const wav = exportWav(song);
    expect(wav.filename.endsWith('.wav')).toBe(true);
    expect(wav.bytes.length).toBeGreaterThan(44);
    expect(renderSong(song).chip).toBe('c64');
    expect(() => exportYm(song)).toThrow(/Vectrex|Atari ST/);
    expect(() => exportVgm(song)).toThrow(/Game Boy/);
  });

  it('exports ym for atari st and wav for nes', () => {
    let stState = newSession('atarist');
    stState = updateInstrument(stState, stState.project.armedInstrumentId, {
      mixNoise: true,
      noisePeriod: 8,
      hardwareEnvelope: true,
      hardwareEnvelopePeriod: 0x1000,
      hardwareEnvelopeShape: 0x0e,
    });
    stState = enterNote(stState, 69);
    const stSong = songForRender(stState.project);
    const ym = exportYm(stSong);
    expect(ym.bytes[0]).toBe('Y'.charCodeAt(0));
    expect(renderSong(stSong).chip).toBe('atarist');
    expect(() => exportAky(stSong)).toThrow(/Vectrex/);
    // Force triangle + short-noise through PCM for duty/noise branches.
    const renderedNes = renderSong(songForRender(enterNote(newSession('nes'), 60).project));
    expect(renderedNes.chip).toBe('nes');
    if (renderedNes.chip === 'nes') {
      const withAll = {
        ...renderedNes,
        frames: renderedNes.frames.map((frame) => ({
          channels: [
            { ...frame.channels[0], wave: 'pulse' as const, duty: 1 as const, hz: 440, amp: 0.5 },
            { ...frame.channels[1], wave: 'none' as const, hz: 0, amp: 0 },
            { ...frame.channels[2], wave: 'triangle' as const, hz: 220, amp: 0.4 },
            { ...frame.channels[3], wave: 'noise' as const, hz: 100, amp: 0.3, noiseShort: true },
          ] as typeof frame.channels,
        })),
      };
      expect(renderPcm(withAll).length).toBeGreaterThan(0);
    }
    const nesSong = songForRender(enterNote(newSession('nes'), 60).project);
    const wav = exportWav(nesSong);
    expect(wav.filename.endsWith('.wav')).toBe(true);
    expect(wav.bytes.length).toBeGreaterThan(44);
    expect(renderSong(nesSong).chip).toBe('nes');
    expect(() => exportYm(nesSong)).toThrow(/Vectrex|Atari ST/);
    expect(() => exportVgm(nesSong)).toThrow(/Game Boy/);
    expect(renderPcm(renderSong(nesSong)).length).toBeGreaterThan(0);
    expect(renderPcm(renderSong(stSong)).length).toBeGreaterThan(0);
  });

  it('exports wav for the FM chips and rejects the register formats', () => {
    for (const chip of ['genesis', 'pc98', 'x68000'] as const) {
      const song = randomSong(chip, 3);
      const rendered = renderSong(song);
      expect(rendered.chip).toBe(chip);
      const pcm = renderPcm(rendered);
      expect(pcm.length).toBeGreaterThan(0);
      expect(Math.max(...pcm.map(Math.abs))).toBeGreaterThan(0);
      const wav = exportWav(song);
      expect(wav.filename.endsWith('.wav')).toBe(true);
      expect(wav.bytes.length).toBeGreaterThan(44);
      expect(() => exportYm(song)).toThrow(/Vectrex|Atari ST/);
      expect(() => exportVgm(song)).toThrow(/Game Boy/);
      expect(() => exportAky(song)).toThrow(/Vectrex/);
    }
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
    const c64Song = songForRender(enterNote(newSession('c64'), 60).project);
    c64Song.instruments[0] = {
      ...c64Song.instruments[0],
      waveSaw: true,
      wavePulse: false,
      filterEnable: true,
      filterMode: 1,
    };
    const c64Rendered = renderSong(c64Song);
    expect(c64Rendered.chip).toBe('c64');
    if (c64Rendered.chip === 'c64') {
      expect(renderPcm(c64Rendered).length).toBeGreaterThan(0);
      const high = {
        ...c64Rendered,
        frames: c64Rendered.frames.map((frame) => ({
          ...frame,
          filterMode: 2 as const,
          voices: frame.voices.map((voice, index) =>
            index === 0 ? { ...voice, wave: 'triangle' as const, filter: true } : voice,
          ) as typeof frame.voices,
        })),
      };
      expect(renderPcm(high).length).toBeGreaterThan(0);
    }
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

    const raw = encodeYm6([ay], 'Solo');
    expect(unwrapYmPayload(raw)).toEqual(raw);
    const name = 'song.ym';
    const headerSize = 22 + name.length;
    const lha = new Uint8Array(2 + headerSize + raw.length);
    lha[0] = headerSize;
    lha[1] = 0;
    lha.set(new TextEncoder().encode('-lh0-'), 2);
    lha[7] = raw.length & 0xff;
    lha[8] = (raw.length >> 8) & 0xff;
    lha[9] = (raw.length >> 16) & 0xff;
    lha[10] = (raw.length >> 24) & 0xff;
    lha[11] = raw.length & 0xff;
    lha[12] = (raw.length >> 8) & 0xff;
    lha[13] = (raw.length >> 16) & 0xff;
    lha[14] = (raw.length >> 24) & 0xff;
    lha[21] = name.length;
    lha.set(new TextEncoder().encode(name), 22);
    lha.set(raw, 2 + headerSize);
    expect(parseYm(unwrapYmPayload(lha)).name).toBe('Solo');

    const compressed = Uint8Array.from(lha);
    compressed.set(new TextEncoder().encode('-lh5-'), 2);
    expect(() => unwrapYmPayload(compressed)).toThrow(/lh0/);
    expect(() => unwrapYmPayload(new Uint8Array(0))).toThrow(/empty|larger/);
  });
});
