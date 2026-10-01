import type { AyFrame } from '@chippy/engines';

export class AkyUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AkyUnsupportedError';
  }
}

/**
 * Phase-1 AKY subset for Malban's Vectrex player.
 * The 6809 is big-endian, but that player reads the song as little-endian
 * `dc.b` bytes. Encodes software-only tones (baked soft envelopes, volume
 * macros, and pitch macros are fine — they are just period/volume streams).
 * Hardware envelope and noise need YM6 export instead.
 */
export function encodeAky(frames: AyFrame[], label = 'Main'): { song: string; playerconfig: string } {
  for (const frame of frames) {
    if ((frame[8] & 0x10) || (frame[9] & 0x10) || (frame[10] & 0x10)) {
      throw new AkyUnsupportedError(
        'Hardware envelope is not in the phase-1 AKY encoder. Turn it off, or export YM6 for full AY features.',
      );
    }
    const mixer = frame[7] ?? 0x3f;
    if ((mixer & 0x38) !== 0x38) {
      throw new AkyUnsupportedError(
        'Noise mix is not in the phase-1 AKY encoder. Turn Noise off, or export YM6 for full AY features.',
      );
    }
  }
  const bytes: number[] = [];
  bytes.push(0x01 | 0x80);
  bytes.push(3);
  const clock = 1_500_000;
  bytes.push(clock & 0xff, (clock >> 8) & 0xff, (clock >> 16) & 0xff, (clock >> 24) & 0xff);
  for (const frame of frames) {
    for (let channel = 0; channel < 3; channel += 1) {
      const volume = frame[8 + channel] & 0x0f;
      const period = frame[channel * 2] | ((frame[channel * 2 + 1] & 0x0f) << 8);
      const toneOn = (frame[7] & (1 << channel)) === 0;
      const type = toneOn && volume > 0 ? 0x01 : 0x00;
      bytes.push(type);
      if (type === 0x01) {
        bytes.push(volume & 0x0f);
        bytes.push(period & 0xff, (period >> 8) & 0x0f);
      }
    }
  }
  const lines = bytes.map((value) => `        dc.b ${value}`);
  const song = [
    `; Chippy phase-1 AKY subset. Little-endian, software-only, 3 channels.`,
    `; Include with aky_player.i. PSG clock 1500000 Hz, 50 Hz frames.`,
    `${label}_Start:`,
    ...lines,
    `${label}_End:`,
    '',
  ].join('\n');
  const playerconfig = [
    'PLY_CFG_ConfigurationIsPresent = 1',
    'PLY_CFG_UseTranspositions = 0',
    'PLY_CFG_UseHardwareSounds = 0',
    'PLY_CFG_SoftOnly = 1',
    'PLY_CFG_SoftOnly_Noise = 0',
    'PLY_CFG_NoSoftNoHard = 1',
    'PLY_CFG_UseEffects = 0',
    '',
  ].join('\n');
  return { song, playerconfig };
}
