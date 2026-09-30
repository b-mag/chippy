import { ayPeriod, midiToHz, type AyFrame, type GbFrame, type RenderedSong } from '@chippy/engines';

const SAMPLE_RATE = 44100;

function square(phase: number, duty = 0.5): number {
  return phase % 1 < duty ? 0.25 : -0.25;
}

/** Mix rendered frames down to 16-bit mono PCM. This path does not use Web Audio. */
export function renderPcm(rendered: RenderedSong): Int16Array {
  const samplesPerFrame = Math.round(SAMPLE_RATE / rendered.frameRate);
  const output = new Int16Array(rendered.frames.length * samplesPerFrame);
  const phases = [0, 0, 0];
  let noise = 1;
  for (let index = 0; index < rendered.frames.length; index += 1) {
    const frame = rendered.frames[index];
    for (let sample = 0; sample < samplesPerFrame; sample += 1) {
      let mixed = 0;
      if (rendered.chip === 'vectrex') {
        const ay = frame as AyFrame;
        for (let channel = 0; channel < 3; channel += 1) {
          const period = (ay[channel * 2] | ((ay[channel * 2 + 1] & 0x0f) << 8)) || 1;
          const hz = 1_500_000 / (16 * period);
          const enabled = (ay[7] & (1 << channel)) === 0;
          const volume = (ay[8 + channel] & 0x10) ? 0.4 : (ay[8 + channel] & 0x0f) / 15;
          if (enabled) {
            mixed += square(phases[channel]) * volume;
            phases[channel] = (phases[channel] + hz / SAMPLE_RATE) % 1;
          }
        }
      } else {
        const gb = frame as GbFrame;
        const pulses: Array<[number, number, number]> = [
          [gb.nr13 | ((gb.nr14 & 7) << 8), gb.nr12, (gb.nr14 & 0x80) && gb.nr12 ? 1 : 0],
          [gb.nr23 | ((gb.nr24 & 7) << 8), gb.nr22, (gb.nr24 & 0x80) && gb.nr22 ? 1 : 0],
        ];
        pulses.forEach(([frequency, envelope, on], channel) => {
          if (!on || frequency <= 0) {
            return;
          }
          const hz = 131072 / (2048 - frequency);
          const volume = ((envelope >> 4) & 0x0f) / 15;
          mixed += square(phases[channel], 0.5) * volume * 0.6;
          phases[channel] = (phases[channel] + hz / SAMPLE_RATE) % 1;
        });
        if (gb.nr30 & 0x80) {
          const frequency = gb.nr33 | ((gb.nr34 & 7) << 8);
          if (frequency > 0) {
            const hz = 65536 / (2048 - frequency);
            const position = Math.floor(phases[2] * 32) % 32;
            mixed += ((gb.wave[position] / 15) * 2 - 1) * 0.25;
            phases[2] = (phases[2] + hz / SAMPLE_RATE) % 1;
          }
        }
        if (gb.nr44 & 0x80) {
          noise = (noise >> 1) | (((noise ^ (noise >> 1)) & 1) << 14);
          mixed += (noise & 1 ? 0.15 : -0.15) * (((gb.nr42 >> 4) & 0x0f) / 15);
        }
      }
      const clamped = Math.max(-1, Math.min(1, mixed));
      output[index * samplesPerFrame + sample] = Math.round(clamped * 32767);
    }
  }
  return output;
}

export function encodeWav(pcm: Int16Array): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);
  pcm.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return new Uint8Array(buffer);
}

/** Used by the period fixture so the WAV test and the AY test share A4. */
export function a4Period(): number {
  return ayPeriod(69);
}

export function a4Hz(): number {
  return midiToHz(69);
}
