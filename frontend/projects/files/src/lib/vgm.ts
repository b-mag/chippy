import type { GbFrame } from '@chippy/engines';

/**
 * VGM 1.70 register log for the DMG APU.
 * 0xB3 writes a Game Boy register. 0x62 waits one 60 Hz frame.
 */
export function encodeVgm(frames: GbFrame[], name: string): Uint8Array {
  const body: number[] = [];
  const write = (register: number, value: number) => {
    body.push(0xb3, register & 0xff, value & 0xff);
  };
  for (const frame of frames) {
    write(0x10, frame.nr10);
    write(0x11, frame.nr11);
    write(0x12, frame.nr12);
    write(0x13, frame.nr13);
    write(0x14, frame.nr14);
    write(0x16, frame.nr21);
    write(0x17, frame.nr22);
    write(0x18, frame.nr23);
    write(0x19, frame.nr24);
    write(0x1a, frame.nr30);
    write(0x1c, frame.nr32);
    write(0x1d, frame.nr33);
    write(0x1e, frame.nr34);
    for (let index = 0; index < 16; index += 1) {
      const high = frame.wave[index * 2] & 0x0f;
      const low = frame.wave[index * 2 + 1] & 0x0f;
      write(0x30 + index, (high << 4) | low);
    }
    write(0x21, frame.nr42);
    write(0x22, frame.nr43);
    write(0x23, frame.nr44);
    body.push(0x62);
  }
  body.push(0x66);
  const header = new Uint8Array(0x100);
  const view = new DataView(header.buffer);
  header.set([0x56, 0x67, 0x6d, 0x20]);
  view.setUint32(0x04, header.length + body.length - 4, true);
  view.setUint32(0x08, 0x170, true);
  view.setUint32(0x80, 4_194_304, true);
  const title = new TextEncoder().encode(name).subarray(0, 16);
  // The data offset at 0x34 points just past the header.
  view.setUint32(0x34, header.length - 0x34, true);
  void title;
  const output = new Uint8Array(header.length + body.length);
  output.set(header);
  output.set(body, header.length);
  return output;
}
