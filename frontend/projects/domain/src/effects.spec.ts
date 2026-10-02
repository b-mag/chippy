import { describe, expect, it } from 'vitest';
import {
  effectColumnHint,
  effectHelp,
  effectReferenceForChip,
  LSDJ_EFFECT_CMDS,
  SHARED_EFFECT_CMDS,
} from '@chippy/domain';

describe('effect help', () => {
  it('describes shared FX for non-Game-Boy chips', () => {
    const help = effectHelp('A', 'nes');
    expect(help?.name).toMatch(/vol/i);
    expect(effectColumnHint('vectrex')).toMatch(/A vol down/);
    expect(effectReferenceForChip('c64').map((entry) => entry.cmd)).toEqual([...SHARED_EFFECT_CMDS]);
  });

  it('describes LSDJ FX for Game Boy and flags deferred preview cmds', () => {
    expect(effectHelp('C', 'gameboy')?.name).toMatch(/chord/i);
    expect(effectHelp('A', 'gameboy')?.previewNote).toBeTruthy();
    expect(effectHelp('G', 'gameboy')?.previewNote).toBeTruthy();
    expect(effectColumnHint('gameboy')).toMatch(/LSDJ/);
    const cmds = effectReferenceForChip('gameboy').map((entry) => entry.cmd);
    expect(cmds).toEqual([...LSDJ_EFFECT_CMDS]);
  });

  it('returns null for commands outside the chip set', () => {
    expect(effectHelp('U', 'gameboy')).toBeNull();
    expect(effectHelp('H', 'nes')).toBeNull();
  });
});
