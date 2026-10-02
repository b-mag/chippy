import type { AyFrame } from '@chippy/engines';

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
export function encodeYm6(
  frames: AyFrame[],
  name: string,
  clockHz = 1_500_000,
  frameRate = 50,
): Uint8Array {
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
  writeUint32(bytes, clockHz);
  writeUint16(bytes, frameRate);
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

const MAX_YM_UPLOAD = 8_000_000;
const MAX_YM_UNCOMPRESSED = 4_000_000;

function readUint32Le(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  );
}

function looksLikeLha(data: Uint8Array): boolean {
  if (data.length < 21) {
    return false;
  }
  const headerSize = data[0];
  if (headerSize < 20 || headerSize + 2 > data.length) {
    return false;
  }
  const method = new TextDecoder().decode(data.subarray(2, 7));
  return method.startsWith('-lh') && method.endsWith('-');
}

/**
 * Unwrap stored LHA (-lh0-) if present; otherwise return the bytes unchanged.
 * Compressed LHA methods are rejected (same policy as the optional API validator).
 */
export function unwrapYmPayload(data: Uint8Array, maxUncompressed = MAX_YM_UNCOMPRESSED): Uint8Array {
  if (data.length === 0 || data.length > MAX_YM_UPLOAD) {
    throw new Error('YM file is empty or larger than 8 MB.');
  }
  if (!looksLikeLha(data)) {
    return data;
  }
  const headerSize = data[0];
  const method = new TextDecoder().decode(data.subarray(2, 7));
  const compressed = readUint32Le(data, 7);
  const original = readUint32Le(data, 11);
  if (original > maxUncompressed) {
    throw new Error('YM archive is larger than the allowed size.');
  }
  const dataStart = 2 + headerSize;
  if (dataStart > data.length || compressed > data.length - dataStart) {
    throw new Error('YM archive header does not match its body.');
  }
  if (method !== '-lh0-') {
    throw new Error('Only stored LHA (lh0) and raw YM5/YM6 are accepted.');
  }
  const payload = data.subarray(dataStart, dataStart + compressed);
  if (payload.length < original) {
    throw new Error('YM archive ended early.');
  }
  return payload.subarray(0, original);
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
