import type { AyFrame } from '@chippy/engines';

const YM_CLOCK = 1_500_000;
const YM_RATE = 50;

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function writeUint32(target: number[], value: number): void {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function writeUint16(target: number[], value: number): void {
  target.push((value >>> 8) & 0xff, value & 0xff);
}

/** Uncompressed interleaved YM6, the form ST-Sound and most players expect. */
export function encodeYm6(frames: AyFrame[], name: string): Uint8Array {
  if (frames.length === 0) {
    throw new Error('There are no frames to export.');
  }
  const bytes: number[] = [];
  bytes.push(...ascii('YM6!'));
  bytes.push(...ascii('LeOnArD!'));
  bytes.push(...ascii(name), 0);
  bytes.push(...ascii('Chippy'), 0);
  bytes.push(...ascii('Chippy phase-1 export'), 0);
  writeUint32(bytes, frames.length);
  writeUint32(bytes, 0);
  writeUint16(bytes, 0);
  writeUint32(bytes, YM_CLOCK);
  writeUint16(bytes, YM_RATE);
  writeUint32(bytes, 0);
  writeUint16(bytes, 0);
  for (let register = 0; register < 16; register += 1) {
    for (const frame of frames) {
      bytes.push(frame[register] & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export interface ParsedYm {
  name: string;
  frames: AyFrame[];
  clockHz: number;
  frameRate: number;
}

function readUint32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function cstring(data: Uint8Array, offset: number): { value: string; next: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) {
    end += 1;
  }
  const value = new TextDecoder().decode(data.subarray(offset, end));
  return { value, next: end + 1 };
}

/** Read an uncompressed YM5! or YM6! dump. Anything else is rejected. */
export function parseYm(data: Uint8Array): ParsedYm {
  const magic = new TextDecoder().decode(data.subarray(0, 4));
  if (magic !== 'YM5!' && magic !== 'YM6!') {
    throw new Error('Only uncompressed YM5 and YM6 files can be opened.');
  }
  const check = new TextDecoder().decode(data.subarray(4, 12));
  if (check !== 'LeOnArD!') {
    throw new Error('The YM check string is missing.');
  }
  const title = cstring(data, 12);
  const author = cstring(data, title.next);
  const comment = cstring(data, author.next);
  let cursor = comment.next;
  const frameCount = readUint32(data, cursor);
  cursor += 4;
  cursor += 4;
  const digidrums = readUint16(data, cursor);
  cursor += 2;
  if (digidrums !== 0) {
    throw new Error('YM files with digidrums are not supported.');
  }
  const clockHz = readUint32(data, cursor);
  cursor += 4;
  const frameRate = readUint16(data, cursor);
  cursor += 2;
  cursor += 4;
  cursor += 2;
  if (frameCount <= 0 || frameCount > 200_000) {
    throw new Error('The YM frame count is not usable.');
  }
  const needed = cursor + frameCount * 16;
  if (data.length < needed) {
    throw new Error('The YM file is shorter than its header claims.');
  }
  const frames: AyFrame[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const registers = new Array<number>(16);
    for (let register = 0; register < 16; register += 1) {
      registers[register] = data[cursor + register * frameCount + frame];
    }
    frames.push(registers);
  }
  return { name: title.value || 'Imported YM', frames, clockHz, frameRate };
}
