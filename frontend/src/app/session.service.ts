import { Injectable, signal } from '@angular/core';
import {
  addInstrument,
  addPattern,
  addSnipInstrument,
  armInstrument,
  clearCell,
  enterCut,
  enterNote,
  loadSong,
  moveCursor,
  newSession,
  redo,
  replaceWithRandom,
  selectOrder,
  setChip,
  setName,
  setOctave,
  setTempo,
  setVolume,
  undo,
  updateInstrument,
  type ChipId,
  type ColumnId,
  type Instrument,
  type SessionState,
  type Song,
} from '@chippy/domain';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly state = signal<SessionState>(newSession('gameboy'));

  snapshot(): SessionState {
    return this.state();
  }

  enterNote(midi: number): void {
    this.state.update((state) => enterNote(state, midi));
  }

  enterCut(): void {
    this.state.update((state) => enterCut(state));
  }

  clear(): void {
    this.state.update((state) => clearCell(state));
  }

  place(row: number, channel: number, column: ColumnId): void {
    this.state.update((state) => ({ ...state, cursor: { ...state.cursor, row, channel, column } }));
  }

  move(deltaRow: number, deltaChannel: number, deltaColumn: number): void {
    this.state.update((state) => moveCursor(state, deltaRow, deltaChannel, deltaColumn));
  }

  volume(value: number): void {
    this.state.update((state) => setVolume(state, value));
  }

  undo(): void {
    this.state.update((state) => undo(state));
  }

  redo(): void {
    this.state.update((state) => redo(state));
  }

  setChip(chip: ChipId): void {
    this.state.update((state) => setChip(state, chip));
  }

  addPattern(): void {
    this.state.update((state) => addPattern(state));
  }

  selectOrder(index: number): void {
    this.state.update((state) => selectOrder(state, index));
  }

  updateInstrument(id: string, patch: Partial<Instrument>): void {
    this.state.update((state) => updateInstrument(state, id, patch));
  }

  arm(id: string): void {
    this.state.update((state) => armInstrument(state, id));
  }

  addInstrument(): void {
    this.state.update((state) => addInstrument(state));
  }

  tempo(value: number): void {
    this.state.update((state) => setTempo(state, value));
  }

  name(value: string): void {
    this.state.update((state) => setName(state, value));
  }

  octave(value: number): void {
    this.state.update((state) => setOctave(state, value));
  }

  random(seed: number, typed: string): boolean {
    const before = this.state().song;
    this.state.update((state) => replaceWithRandom(state, seed, typed));
    return this.state().song !== before;
  }

  load(song: Song): void {
    this.state.update((state) => loadSong(state, song));
  }

  commitSnip(name: string, frames: number[][]): void {
    this.state.update((state) => {
      const added = addSnipInstrument(state.song, name, frames);
      return { ...state, song: added.song };
    });
  }
}
