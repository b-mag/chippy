import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  armedInstrument,
  chipDefinition,
  chipIds,
  formatNote,
  noteFromKey,
  type ColumnId,
  type Song,
} from '@chippy/domain';
import { AestheticService, type AestheticId } from '../aesthetic.service';
import { PlaybackService } from '../playback.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-tracker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './tracker.component.html',
})
export class TrackerComponent {
  readonly session = inject(SessionService);
  readonly columns: ColumnId[] = ['note', 'instrument', 'volume'];
  private readonly playback = inject(PlaybackService);
  private readonly http = inject(HttpClient);
  readonly aesthetics = inject(AestheticService);

  readonly state = this.session.state;
  readonly playRow = this.playback.row;
  readonly status = signal('');
  readonly loop = signal(false);
  readonly muted = signal<ReadonlySet<number>>(new Set());
  readonly solo = signal<ReadonlySet<number>>(new Set());
  readonly randomStage = signal<'closed' | 'warn' | 'type'>('closed');
  readonly confirmText = signal('');
  readonly exportOpen = signal(false);

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
  readonly armed = computed(() => armedInstrument(this.state().song));
  readonly chips = chipIds();

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

  play(fromCursor: boolean): void {
    const state = this.state();
    this.playback.play(
      state.song,
      state.cursor.orderIndex,
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

  commitRandom(): void {
    const seed = Math.floor(Math.random() * 1_000_000);
    const replaced = this.session.random(seed, this.confirmText());
    if (replaced) {
      this.randomStage.set('closed');
      this.confirmText.set('');
      this.status.set('Random song is on screen.');
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

  aesthetic(id: AestheticId): void {
    this.aesthetics.select(id);
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
