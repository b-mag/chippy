import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  armedInstrument,
  chipDefinition,
  chipIds,
  formatNote,
  noteFromKey,
  patternDisplayName,
  type ColumnId,
  type Song,
} from '@chippy/domain';
import { AestheticService } from '../aesthetic.service';
import { PlaybackService, type LoopMode } from '../playback.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-tracker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './tracker.component.html',
  styleUrl: './tracker.component.css',
})
export class TrackerComponent {
  readonly session = inject(SessionService);
  readonly columns: ColumnId[] = ['note', 'instrument', 'volume'];
  private readonly playback = inject(PlaybackService);
  private readonly http = inject(HttpClient);
  readonly aesthetics = inject(AestheticService);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  readonly state = this.session.state;
  readonly playRow = this.playback.row;
  readonly status = signal('');
  readonly loop = signal<LoopMode>('off');
  private readonly loopCycle: LoopMode[] = ['off', 'pattern', 'song'];
  readonly loopLabel = computed(() => {
    const mode = this.loop();
    if (mode === 'pattern') return 'Loop Pattern';
    if (mode === 'song') return 'Loop Song';
    return 'Loop Off';
  });
  readonly muted = signal<ReadonlySet<number>>(new Set());
  readonly solo = signal<ReadonlySet<number>>(new Set());
  readonly exportOpen = signal(false);
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly dragFrom = signal<number | null>(null);
  readonly dropIndex = signal<number | null>(null);

  readonly chip = computed(() => chipDefinition(this.state().song.chip));
  readonly grid = computed(() => {
    const pattern = this.pattern();
    const cursor = this.state().cursor;
    return pattern.rows.map((row, rowIndex) => ({
      rowIndex,
      channels: this.chip().channels.map((channel, channelIndex) => {
        const cell = row[channelIndex];
        return {
          id: channel.id,
          index: channelIndex,
          cells: this.columns.map((column) => ({
            column,
            text: this.label(column, cell.note, cell.cut, cell.instrumentId, cell.volume),
            selected: cursor.row === rowIndex && cursor.channel === channelIndex && cursor.column === column,
          })),
        };
      }),
    }));
  });
  readonly pattern = computed(() => {
    const state = this.state();
    const id = state.song.order[state.cursor.orderIndex];
    return state.song.patterns.find((item) => item.id === id) ?? state.song.patterns[0];
  });
  readonly orderEntries = computed(() => {
    const song = this.state().song;
    return song.order.map((id, index) => {
      const pattern = song.patterns.find((item) => item.id === id);
      const name = pattern ? patternDisplayName(pattern, index) : `Pattern ${index + 1}`;
      return {
        id,
        slotKey: `${index}-${id}`,
        indexLabel: String(index + 1).padStart(2, '0'),
        name,
      };
    });
  });
  readonly armed = computed(() => armedInstrument(this.state().song));
  readonly chips = chipIds();

  constructor() {
    effect(() => {
      const tick = this.playback.tick();
      if (!tick || !this.playback.playing()) {
        return;
      }
      this.session.followPlayback(tick.orderIndex, tick.row);
    });
    effect(() => {
      if (this.renamingId() && this.renameInput()) {
        queueMicrotask(() => this.renameInput()?.nativeElement.focus());
      }
    });
  }

  label(column: ColumnId, cellNote: number | null, cut: boolean, instrumentId: string | null, volume: number | null): string {
    if (column === 'note') {
      if (cut) return 'OFF';
      if (cellNote === null) return '---';
      return formatNote(cellNote);
    }
    if (column === 'instrument') {
      return instrumentId ? instrumentId.replace('ins-', '').replace('snip-', 's') : '.';
    }
    return volume === null ? '..' : volume.toString(16).toUpperCase();
  }

  onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    const key = event.key;
    if (key === ' ' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.session.redo();
      } else {
        this.session.undo();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'y') {
      event.preventDefault();
      this.session.redo();
      return;
    }
    if (key === ' ') {
      this.togglePlay();
      return;
    }
    if (key === 'ArrowUp') this.session.move(-1, 0, 0);
    else if (key === 'ArrowDown') this.session.move(1, 0, 0);
    else if (key === 'ArrowLeft') this.session.move(0, 0, -1);
    else if (key === 'ArrowRight') this.session.move(0, 0, 1);
    else if (key === 'Backspace' || key === 'Delete') this.session.clear();
    else if (key === '`' || key === '~') {
      this.session.enterCut();
    } else if (key === '[' || key === ']') {
      this.session.octave(this.state().octave + (key === ']' ? 1 : -1));
    } else if (this.state().cursor.column === 'volume' && /^[0-9a-f]$/i.test(key)) {
      this.session.volume(parseInt(key, 16));
    } else if (this.state().cursor.column === 'note') {
      const midi = noteFromKey(key.toLowerCase(), this.state().octave);
      if (midi !== null) {
        this.session.enterNote(midi);
        this.playback.audition(this.state().song, midi);
      }
    }
  }

  cycleLoop(): void {
    const index = this.loopCycle.indexOf(this.loop());
    this.loop.set(this.loopCycle[(index + 1) % this.loopCycle.length]);
  }

  play(fromCursor: boolean): void {
    const state = this.state();
    this.playback.play(
      state.song,
      fromCursor ? state.cursor.orderIndex : 0,
      fromCursor ? state.cursor.row : 0,
      this.loop(),
      new Set(this.muted()),
      new Set(this.solo()),
    );
  }

  togglePlay(): void {
    if (this.playback.playing()) {
      this.playback.stop();
    } else {
      this.play(true);
    }
  }

  stop(): void {
    this.playback.stop();
  }

  toggleChannel(kind: 'mute' | 'solo', index: number): void {
    const source = kind === 'mute' ? this.muted() : this.solo();
    const next = new Set(source);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    if (kind === 'mute') this.muted.set(next);
    else this.solo.set(next);
  }

  fieldValue(key: string): string | number | boolean {
    const instrument = this.armed() as unknown as Record<string, string | number | boolean | null>;
    return instrument[key] ?? '';
  }

  patchField(key: string, raw: string, control: string): void {
    let value: string | number | boolean = raw;
    if (control === 'number' || control === 'select') {
      value = Number(raw);
    }
    if (control === 'toggle') {
      value = raw === 'true';
    }
    this.session.updateInstrument(this.armed().id, { [key]: value } as Partial<import('@chippy/domain').Instrument>);
  }

  beginRename(id: string, name: string): void {
    this.renamingId.set(id);
    this.renameDraft.set(name);
  }

  commitRename(id: string): void {
    if (this.renamingId() !== id) {
      return;
    }
    const draft = this.renameDraft().trim();
    this.renamingId.set(null);
    if (draft) {
      this.session.renamePattern(id, draft);
    }
  }

  onRenameKey(event: KeyboardEvent, id: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.renamingId.set(null);
    }
  }

  onOrderDragStart(event: DragEvent, index: number): void {
    this.dragFrom.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onOrderDragEnd(): void {
    this.dragFrom.set(null);
    this.dropIndex.set(null);
  }

  onOrderDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const list = (event.currentTarget as HTMLElement);
    const slots = Array.from(list.querySelectorAll<HTMLElement>('.order-slot[data-index]'));
    if (slots.length === 0) {
      return;
    }
    let next = slots.length;
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (event.clientY < mid) {
        next = Number(slot.dataset['index']);
        break;
      }
    }
    this.dropIndex.set(next);
  }

  onOrderDrop(event: DragEvent): void {
    event.preventDefault();
    const from = this.dragFrom();
    let to = this.dropIndex();
    this.dragFrom.set(null);
    this.dropIndex.set(null);
    if (from === null || to === null) {
      return;
    }
    // Dropping after an item means insert at that index after removal adjustment.
    if (to > from) {
      to -= 1;
    }
    if (to !== from) {
      this.session.reorderOrder(from, to);
    }
  }

  async save(): Promise<void> {
    const { serializeProject: serialize } = await import('@chippy/files');
    const song = this.state().song;
    const blob = new Blob([serialize(song)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.name.replace(/[^a-z0-9-_]+/gi, '-') || 'chippy'}.chippy.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  open(file: File | undefined): void {
    if (!file) return;
    const body = new FormData();
    body.set('file', file);
    this.http.post<unknown>('/api/projects/validate', body).subscribe({
      next: (song) => {
        this.session.load(song as Song);
        this.status.set('Opened project.');
      },
      error: () => this.status.set('That file was rejected.'),
    });
  }

  async exportFile(kind: 'wav' | 'ym' | 'vgm' | 'aky'): Promise<void> {
    this.exportOpen.set(false);
    try {
      const files = await import('@chippy/files');
      const song = this.state().song;
      const aky = kind === 'aky' ? files.exportAky(song) : null;
      const bundles = kind === 'wav' ? [files.exportWav(song)]
        : kind === 'ym' ? [files.exportYm(song)]
        : kind === 'vgm' ? [files.exportVgm(song)]
        : [aky!.songFile, aky!.configFile];
      bundles.forEach((bundle) => this.download(bundle.bytes, bundle.filename, bundle.mime));
      this.status.set('Export ready.');
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  private download(bytes: Uint8Array, filename: string, mime: string): void {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  aesthetic(id: string): void {
    if (id === 'vaporwave' || id === 'dark' || id === 'plain') {
      this.aesthetics.select(id);
    }
  }

  sessionName(value: string): void {
    this.session.name(value);
  }

  sessionTempo(value: string): void {
    this.session.tempo(Number(value));
  }

  place(row: number, channel: number, column: ColumnId): void {
    this.session.place(row, channel, column);
  }

  chipChange(id: string): void {
    if (id === 'gameboy' || id === 'vectrex') {
      this.session.setChip(id);
    }
  }
}
