import { chipDefinition } from '@chippy/domain';
import {
  ayPeriod,
  midiToHz,
  nesDutyFraction,
  type AyFrame,
  type GbFrame,
  type NesFrame,
  type RenderedSong,
  type SidFrame,
} from '@chippy/engines';

const SAMPLE_RATE = 44100;

function square(phase: number, duty = 0.5): number {
  return phase % 1 < duty ? 0.25 : -0.25;
}

function saw(phase: number): number {
  return (phase % 1) * 0.5 - 0.25;
}

function triangle(phase: number): number {
  const t = phase % 1;
  return (t < 0.5 ? t * 4 - 1 : 3 - t * 4) * 0.25;
}

function waveSample(wave: SidFrame['voices'][0]['wave'], phase: number, pulseWidth: number, noise: number): number {
  if (wave === 'square') return square(phase, pulseWidth);
  if (wave === 'saw') return saw(phase);
  if (wave === 'triangle') return triangle(phase);
  if (wave === 'noise') return noise & 1 ? 0.2 : -0.2;
  return 0;
}

function ayHardwareEnvelopeLevel(shape: number, phase: number): number {
  const continueBit = (shape & 0x08) !== 0;
  const attack = (shape & 0x04) !== 0;
  const alternate = (shape & 0x02) !== 0;
  const hold = (shape & 0x01) !== 0;
  if (!continueBit) {
    const cycle = phase % 32;
    if (attack) {
      return cycle < 16 ? cycle / 15 : 0;
    }
    return cycle < 16 ? (15 - cycle) / 15 : 0;
  }
  if (hold && phase >= 16) {
    const endHigh = alternate ? !attack : attack;
    return endHigh ? 1 : 0;
  }
  if (alternate && Math.floor(phase / 16) % 2 === 1) {
    return (15 - (phase % 16)) / 15;
  }
  const step = phase % 16;
  return attack ? step / 15 : (15 - step) / 15;
}

/** Mix rendered frames down to 16-bit mono PCM. This path does not use Web Audio. */
export function renderPcm(rendered: RenderedSong): Int16Array {
  const samplesPerFrame = Math.round(SAMPLE_RATE / rendered.frameRate);
  const output = new Int16Array(rendered.frames.length * samplesPerFrame);
  const phases = [0, 0, 0, 0];
  let noise = 1;
  let filterLp = 0;
  let filterBp = 0;
  let envShape = 0x0e;
  let envPeriod = 0x1000;
  let envClock = 0;
  for (let index = 0; index < rendered.frames.length; index += 1) {
    const frame = rendered.frames[index];
    for (let sample = 0; sample < samplesPerFrame; sample += 1) {
      let mixed = 0;
      if (rendered.chip === 'vectrex' || rendered.chip === 'atarist') {
        const ayClock = chipDefinition(rendered.chip).clockHz;
        const ay = frame as AyFrame;
        const mixer = ay[7] ?? 0x3f;
        const noisePeriod = (ay[6] & 0x1f) || 1;
        if (ay[8] & 0x10 || ay[9] & 0x10 || ay[10] & 0x10) {
          envPeriod = ((ay[12] & 0xff) << 8) | (ay[11] & 0xff) || envPeriod;
          envShape = ay[13] & 0x0f;
        }
        const envStep = Math.floor(envClock / Math.max(1, Math.floor(envPeriod / 256) || 1));
        // Advance AY-ish noise LFSR a few times per sample based on noise period.
        const noiseTicks = Math.max(1, Math.round(8 / noisePeriod));
        for (let tick = 0; tick < noiseTicks; tick += 1) {
          noise = (noise >> 1) | (((noise ^ (noise >> 1)) & 1) << 14);
        }
        const noiseSample = noise & 1 ? 0.22 : -0.22;
        for (let channel = 0; channel < 3; channel += 1) {
          const period = (ay[channel * 2] | ((ay[channel * 2 + 1] & 0x0f) << 8)) || 1;
          const hz = ayClock / (16 * period);
          const toneOn = (mixer & (1 << channel)) === 0;
          const noiseOn = (mixer & (1 << (channel + 3))) === 0;
          const volReg = ay[8 + channel] ?? 0;
          const level = (volReg & 0x10)
            ? ayHardwareEnvelopeLevel(envShape, envStep)
            : (volReg & 0x0f) / 15;
          if (toneOn) {
            mixed += square(phases[channel]) * level;
            phases[channel] = (phases[channel] + hz / SAMPLE_RATE) % 1;
          }
          if (noiseOn) {
            mixed += noiseSample * level * 0.7;
          }
        }
        if (sample === samplesPerFrame - 1) {
          envClock += 1;
        }
      } else if (rendered.chip === 'c64') {
        const sid = frame as SidFrame;
        let dry = 0;
        let wet = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const voice = sid.voices[channel];
          if (voice.amp <= 0 || voice.hz <= 0 || voice.wave === 'none') {
            continue;
          }
          noise = (noise >> 1) | (((noise ^ (noise >> 1)) & 1) << 14);
          const sampleValue = waveSample(voice.wave, phases[channel], voice.pulseWidth, noise) * voice.amp;
          phases[channel] = (phases[channel] + voice.hz / SAMPLE_RATE) % 1;
          if (voice.filter) {
            wet += sampleValue;
          } else {
            dry += sampleValue;
          }
        }
        const cutoff = 0.01 + (sid.filterCutoff / 2047) * 0.35;
        const q = 1 + (sid.filterResonance / 15) * 4;
        filterBp += cutoff * (wet - filterLp - filterBp / q);
        filterLp += cutoff * filterBp;
        const hp = wet - filterLp - filterBp / q;
        let filtered = filterLp;
        if (sid.filterMode === 1) filtered = filterBp;
        if (sid.filterMode === 2) filtered = hp;
        mixed = dry + filtered * 0.9;
      } else if (rendered.chip === 'nes') {
        const nes = frame as NesFrame;
        for (let channel = 0; channel < 4; channel += 1) {
          const voice = nes.channels[channel];
          if (voice.amp <= 0 || voice.hz <= 0 || voice.wave === 'none') {
            continue;
          }
          if (voice.wave === 'noise') {
            const taps = voice.noiseShort ? 6 : 1;
            noise = (noise >> 1) | (((noise ^ (noise >> taps)) & 1) << 14);
            mixed += (noise & 1 ? 0.18 : -0.18) * voice.amp;
            continue;
          }
          if (voice.wave === 'triangle') {
            // Soft triangle helper peaks at ±0.25; scale up so TRI matches pulse loudness.
            mixed += triangle(phases[channel]) * voice.amp * 2.2;
          } else {
            mixed += square(phases[channel], nesDutyFraction(voice.duty)) * voice.amp * 0.7;
          }
          phases[channel] = (phases[channel] + voice.hz / SAMPLE_RATE) % 1;
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
