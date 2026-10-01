import { Injectable, signal } from '@angular/core';
import {
  activeSongBody,
  addInstrument,
  addInstrumentFromCustomPreset,
  addInstrumentFromPreset,
  addPattern,
  addRandomPattern,
  addSnipInstrument,
  addSong,
  armInstrument,
  changeInstrumentKind,
  clearCell,
  clearPattern,
  deleteInstrument,
  duplicatePattern,
  enterCut,
  enterNote,
  followPlaybackOrder,
  loadProject,
  markClean,
  moveCursor,
  newProjectForChip,
  newSession,
  redo,
  removeCustomPreset,
  removeOrderEntry,
  removeSong,
  renameInstrument,
  renamePattern,
  reorderOrder,
  importCustomPreset,
  saveCustomPreset,
  selectOrder,
  selectSong,
  setName,
  setOctave,
  setSongName,
  setTempo,
  setVolume,
  setEffect,
  setCellInstrument,
  songForRender,
  undo,
  updateInstrument,
  type ChipId,
  type ColumnId,
  type CellEffect,
  type Instrument,
  type InstrumentKind,
  type CustomInstrumentPreset,
  type InstrumentPreset,
  type PresetRole,
  type Project,
  type SessionState,
  type Song,
} from '@chippy/domain';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly state = signal<SessionState>(newSession('gameboy'));

  snapshot(): SessionState {
    return this.state();
  }

  /** Active song flat view for playback and export. */
  song(): Song {
    return songForRender(this.state().project);
  }

  activeBody() {
    return activeSongBody(this.state().project);
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

  effect(effect: CellEffect | null): void {
    this.state.update((state) => setEffect(state, effect));
  }

  cellInstrument(instrumentId: string | null): void {
    this.state.update((state) => setCellInstrument(state, instrumentId));
  }

  undo(): void {
    this.state.update((state) => undo(state));
  }

  redo(): void {
    this.state.update((state) => redo(state));
  }

  /** Wipe and start a blank project for the chip (after user confirm). */
  newProjectForChip(chip: ChipId): void {
    this.state.update((state) => newProjectForChip(state, chip));
  }

  addPattern(): void {
    this.state.update((state) => addPattern(state));
  }

  duplicatePattern(): void {
    this.state.update((state) => duplicatePattern(state));
  }

  addRandomPattern(seed = Math.floor(Math.random() * 1_000_000)): void {
    this.state.update((state) => addRandomPattern(state, seed));
  }

  clearPattern(): void {
    this.state.update((state) => clearPattern(state));
  }

  removePattern(): void {
    this.state.update((state) => removeOrderEntry(state));
  }

  renamePattern(id: string, name: string): void {
    this.state.update((state) => renamePattern(state, id, name));
  }

  reorderOrder(fromIndex: number, toIndex: number): void {
    this.state.update((state) => reorderOrder(state, fromIndex, toIndex));
  }

  selectOrder(index: number): void {
    this.state.update((state) => selectOrder(state, index));
  }

  followPlayback(orderIndex: number, row: number): void {
    this.state.update((state) => followPlaybackOrder(state, orderIndex, row));
  }

  updateInstrument(id: string, patch: Partial<Instrument>): void {
    this.state.update((state) => updateInstrument(state, id, patch));
  }

  renameInstrument(id: string, name: string): void {
    this.state.update((state) => renameInstrument(state, id, name));
  }

  changeInstrumentKind(id: string, kind: InstrumentKind): void {
    this.state.update((state) => changeInstrumentKind(state, id, kind));
  }

  deleteInstrument(id: string): void {
    this.state.update((state) => deleteInstrument(state, id));
  }

  arm(id: string): void {
    this.state.update((state) => armInstrument(state, id));
  }

  addInstrument(kind?: InstrumentKind): void {
    this.state.update((state) => addInstrument(state, kind));
  }

  addFromPreset(preset: InstrumentPreset): void {
    this.state.update((state) => addInstrumentFromPreset(state, preset));
  }

  addFromCustomPreset(id: string): void {
    this.state.update((state) => addInstrumentFromCustomPreset(state, id));
  }

  saveCustomPreset(name: string, role?: PresetRole): void {
    this.state.update((state) => saveCustomPreset(state, name, role));
  }

  importCustomPreset(preset: Omit<CustomInstrumentPreset, 'id'> | CustomInstrumentPreset): void {
    this.state.update((state) => importCustomPreset(state, preset));
  }

  removeCustomPreset(id: string): void {
    this.state.update((state) => removeCustomPreset(state, id));
  }

  tempo(value: number): void {
    this.state.update((state) => setTempo(state, value));
  }

  name(value: string): void {
    this.state.update((state) => setName(state, value));
  }

  songName(value: string): void {
    this.state.update((state) => setSongName(state, value));
  }

  selectSong(id: string): void {
    this.state.update((state) => selectSong(state, id));
  }

  addSong(): void {
    this.state.update((state) => addSong(state));
  }

  removeSong(): void {
    this.state.update((state) => removeSong(state));
  }

  octave(value: number): void {
    this.state.update((state) => setOctave(state, value));
  }

  load(project: Project): void {
    this.state.update((state) => loadProject(state, project));
  }

  markClean(): void {
    this.state.update((state) => markClean(state));
  }

  commitSnip(name: string, frames: number[][]): void {
    this.state.update((state) => {
      const added = addSnipInstrument(state.project, name, frames);
      return { ...state, project: added.project, dirty: true };
    });
  }
}
