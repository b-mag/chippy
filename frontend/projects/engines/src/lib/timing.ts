/**
 * Chip timing shared by playback, WAV, YM6, VGM, and AKY.
 * The Vectrex PSG is 1.5 MHz and is rendered at 50 Hz.
 * The Game Boy APU is rendered at 60 Hz from the 131072 Hz tone base.
 */

/** MIDI note 69 is A4, 440 Hz. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * AY-3-8912 tone period. The chip divides its clock by 16, then by this
 * 12-bit period, to produce the tone.
 */
export function ayPeriod(midi: number, clockHz = 1_500_000): number {
  const period = Math.round(clockHz / (16 * midiToHz(midi)));
  return Math.min(4095, Math.max(1, period));
}

/** Game Boy NR13/NR14 frequency value. `hz = 131072 / (2048 - x)`. */
export function gbFrequency(midi: number): number {
  const value = Math.round(2048 - 131072 / midiToHz(midi));
  return Math.min(2047, Math.max(0, value));
}

/**
 * How many register frames fit in one pattern row.
 * A row is a sixteenth note at the song tempo.
 */
export function framesPerRow(tempo: number, frameRate: number): number {
  const rowsPerSecond = (tempo * 4) / 60;
  return Math.max(1, Math.round(frameRate / rowsPerSecond));
}
