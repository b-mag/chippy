import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  activeSongBody,
  armedInstrument,
  channelIsPlaceholder,
  chipDefinition,
  chipIds,
  chipLabel,
  findInstrumentIdByNumberLabel,
  fmAlgorithmRouting,
  fmFieldValue,
  effectCmdsForChip,
  effectColumnHint,
  effectHelp,
  effectReferenceForChip,
  formatEffect,
  formatNote,
  isChipId,
  isEffectCmdForChip,
  isFmChip,
  isFmPatchFieldKey,
  kindAllowedOnChannel,
  mergeFmPatch,
  noteFromKey,
  patchFmField,
  patchFmOperator,
  defaultRoleForKind,
  groupPresetsForMenu,
  patternDisplayName,
  songForRender,
  FM_OPERATOR_FIELDS,
  type CellEffect,
  type ChipId,
  type ColumnId,
  type EffectCmd,
  type FmOperator,
  type Instrument,
  type InstrumentKind,
  type InstrumentPreset,
  type PresetMenuEntry,
} from '@chippy/domain';
import { PlaybackService, type LoopMode } from '../playback.service';
import { RadioPlayerService } from '../radio/radio-player.service';
import { SessionService } from '../session.service';
import { SupportEntitlementService } from '../support-entitlement.service';

function detectMobileTracker(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;
  return uaMobile || (coarse && narrow);
}

@Component({
  selector: 'app-tracker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './tracker.component.html',
  styleUrl: './tracker.component.css',
})
export class TrackerComponent {
  readonly session = inject(SessionService);
  readonly columns: ColumnId[] = ['note', 'instrument', 'volume', 'effect'];
  private readonly playback = inject(PlaybackService);
  private readonly radio = inject(RadioPlayerService);
  private readonly entitlement = inject(SupportEntitlementService);
  /** Mobile browsers get a desktop-only message instead of tracker controls. */
  readonly mobileTrackerBlocked = signal(detectMobileTracker());
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly instrumentDialog = viewChild<ElementRef<HTMLElement>>('instrumentDialog');
  private readonly openProjectInput = viewChild<ElementRef<HTMLInputElement>>('openProjectInput');
  private readonly importInstrumentInput = viewChild<ElementRef<HTMLInputElement>>('importInstrumentInput');
  private readonly presetSearchInput = viewChild<ElementRef<HTMLInputElement>>('presetSearchInput');

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
  readonly fxReferenceOpen = signal(false);
  readonly presetsOpen = signal(false);
  readonly instrumentEditorOpen = signal(false);
  readonly presetSearch = signal('');
  /** Bumps when a chip switch is cancelled so the select rebinds to the current chip. */
  readonly chipSelectEpoch = signal(0);
  readonly renamingId = signal<string | null>(null);
  readonly renameDraft = signal('');
  readonly dragFrom = signal<number | null>(null);
  readonly dropIndex = signal<number | null>(null);
  readonly studioFocused = signal(false);
  readonly lastAuditionMidi = signal(60);
  readonly presetStatus = signal('');
  private knobDrag: {
    key: string;
    min: number;
    max: number;
    startY: number;
    startValue: number;
  } | null = null;
  private hotReloadFrame: number | null = null;
  private readonly onKnobPointerMove = (event: PointerEvent): void => this.moveKnobDrag(event);
  private readonly onKnobPointerUp = (): void => this.endKnobDrag();

  readonly project = computed(() => this.state().project);
  readonly song = computed(() => songForRender(this.state().project));
  readonly songBody = computed(() => activeSongBody(this.state().project));
  readonly chip = computed(() => chipDefinition(this.project().chip));
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
          placeholder: channel.placeholder === true,
          cells: this.columns.map((column) => ({
            column,
            text: this.label(column, cell),
            selected: cursor.row === rowIndex && cursor.channel === channelIndex && cursor.column === column,
          })),
        };
      }),
    }));
  });
  readonly pattern = computed(() => {
    const body = this.songBody();
    const cursor = this.state().cursor;
    const id = body.order[cursor.orderIndex];
    return body.patterns.find((item) => item.id === id) ?? body.patterns[0];
  });
  readonly orderEntries = computed(() => {
    const body = this.songBody();
    return body.order.map((id, index) => {
      const pattern = body.patterns.find((item) => item.id === id);
      const name = pattern ? patternDisplayName(pattern, index) : `Pattern ${index + 1}`;
      return {
        id,
        slotKey: `${index}-${id}`,
        indexLabel: String(index + 1).padStart(2, '0'),
        name,
      };
    });
  });
  readonly armed = computed(() => armedInstrument(this.project()));
  readonly chips = chipIds();
  /**
   * Channel the editor describes. A placeholder column drives nothing, so the
   * editor falls back to the whole chip instead of showing an empty panel.
   */
  readonly editorChannel = computed(() => {
    const definition = this.chip();
    const channel = definition.channels[this.state().cursor.channel];
    if (!channel || channel.placeholder) {
      return definition.channels.find((item) => !item.placeholder) ?? null;
    }
    return channel;
  });
  readonly kindOptions = computed(() => {
    const definition = this.chip();
    const channel = this.editorChannel();
    const forChannel = channel ? definition.kindsForChannel(channel.id) : [];
    const allowed = forChannel.length > 0 ? forChannel : definition.kinds;
    const current = this.armed().kind;
    return allowed.includes(current) ? allowed : [current, ...allowed];
  });
  readonly hardwareFields = computed(() => {
    const armed = this.armed();
    const channel = this.editorChannel();
    return this.chip().fields.filter(
      (field) => field.kinds.includes(armed.kind) && (!field.channelId || field.channelId === channel?.id),
    );
  });
  readonly showFmOperators = computed(() => this.armed().kind === 'fm');
  /** Wider dialog for FM operator grids and dense hardware panels (SID, AY macros, etc.). */
  readonly instrumentModalExpanded = computed(
    () => this.showFmOperators() || this.hardwareFields().length >= 10,
  );
  readonly operatorFields = FM_OPERATOR_FIELDS;
  /** Operators 1-4 with the role the current algorithm gives them. */
  readonly fmOperators = computed(() => {
    const patch = mergeFmPatch(this.armed().fm);
    const routing = fmAlgorithmRouting(patch.algorithm);
    return patch.operators.map((operator, index) => ({
      index,
      label: `OP${index + 1}`,
      carrier: routing.carriers.includes(index),
      modulates: routing.modulators
        .map((sources, target) => (sources.includes(index) ? `OP${target + 1}` : null))
        .filter((item): item is string => item !== null),
      values: operator,
    }));
  });
  readonly presetGroups = computed(() =>
    groupPresetsForMenu(this.project().chip, this.project().customPresets ?? []),
  );
  readonly filteredPresetGroups = computed(() => {
    const query = this.presetSearch().trim().toLowerCase();
    const groups = this.presetGroups();
    if (!query) {
      return groups;
    }
    return groups
      .map((roleGroup) => ({
        ...roleGroup,
        kinds: roleGroup.kinds
          .map((kindGroup) => ({
            ...kindGroup,
            entries: kindGroup.entries.filter((entry) => entry.name.toLowerCase().includes(query)),
          }))
          .filter((kindGroup) => kindGroup.entries.length > 0),
      }))
      .filter((roleGroup) => roleGroup.kinds.length > 0);
  });
  readonly premiumUnlocked = computed(() => this.entitlement.canUsePremiumPresets());
  readonly showSnip = computed(() => {
    const chip = this.project().chip;
    return chip === 'vectrex' || chip === 'atarist';
  });
  readonly isGameBoy = computed(() => this.project().chip === 'gameboy');
  readonly fxReference = computed(() => effectReferenceForChip(this.project().chip));
  readonly fxInspector = computed(() => {
    const chip = this.project().chip;
    const cursor = this.state().cursor;
    if (cursor.column !== 'effect') {
      return null;
    }
    const cell = this.pattern().rows[cursor.row]?.[cursor.channel];
    const effect = cell?.effect ?? null;
    const display = formatEffect(effect, chip);
    if (!effect) {
      return {
        display,
        title: 'Empty FX',
        summary:
          chip === 'gameboy'
            ? 'Type a letter (A–Z command), then two hex digits.'
            : 'Type a letter (A/U/D/R/C/P), then a hex nibble.',
        previewNote: undefined as string | undefined,
      };
    }
    const help = effectHelp(effect.cmd, chip);
    return {
      display,
      title: help ? `${effect.cmd} · ${help.name}` : effect.cmd,
      summary: help?.summary ?? 'Unknown command for this chip.',
      previewNote: help?.previewNote,
    };
  });
  readonly fxIdleTip = computed(() => {
    if (this.state().cursor.column === 'effect') {
      return null;
    }
    if (this.project().chip !== 'gameboy') {
      return null;
    }
    return 'FX · letter then two hex digits · ? for LSDJ list';
  });
  readonly exportKinds = computed(() => {
    const chip = this.project().chip;
    if (chip === 'gameboy') {
      return [
        { id: 'wav' as const, label: 'WAV' },
        { id: 'vgm' as const, label: 'VGM' },
        { id: 'sav' as const, label: 'LSDJ SAV' },
      ];
    }
    if (chip === 'c64' || chip === 'nes' || isFmChip(chip)) {
      return [{ id: 'wav' as const, label: 'WAV' }];
    }
    if (chip === 'atarist') {
      return [
        { id: 'wav' as const, label: 'WAV' },
        { id: 'ym' as const, label: 'YM6' },
      ];
    }
    return [
      { id: 'wav' as const, label: 'WAV' },
      { id: 'ym' as const, label: 'YM6' },
      { id: 'aky' as const, label: 'Vectrex AKY' },
    ];
  });

  constructor() {
    this.playback.armUnlock();
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
    effect(() => {
      // Focus the dialog itself, not the name field, so Z–M still audition.
      if (this.instrumentEditorOpen() && this.instrumentDialog()) {
        queueMicrotask(() => this.instrumentDialog()?.nativeElement.focus());
      }
    });
    effect(() => {
      if (this.presetsOpen() && this.presetSearchInput()) {
        queueMicrotask(() => this.presetSearchInput()?.nativeElement.focus());
      }
    });
  }

  kindLabel(kind: InstrumentKind): string {
    const labels: Record<InstrumentKind, string> = {
      pulse: 'Pulse',
      wave: 'Wave',
      noise: 'Noise',
      tone: 'Tone',
      snip: 'Snip',
      sid: 'SID',
      triangle: 'Triangle',
      fm: 'FM',
    };
    return labels[kind];
  }

  /** Open the instrument editor on `id`, arming it first so Test plays that sound. */
  openInstrumentEditor(id: string): void {
    if (id !== this.project().armedInstrumentId) {
      this.session.arm(id);
    }
    this.studioFocused.set(true);
    this.instrumentEditorOpen.set(true);
  }

  closeInstrumentEditor(): void {
    this.instrumentEditorOpen.set(false);
  }

  instrumentFitsCursor(kind: InstrumentKind): boolean {
    return kindAllowedOnChannel(this.project().chip, this.state().cursor.channel, kind);
  }

  chipOptionLabel(id: string): string {
    return isChipId(id) ? chipLabel(id) : id;
  }

  /** Columns the chip has but Chippy does not drive yet. */
  channelPlaceholder(index: number): boolean {
    return channelIsPlaceholder(this.project().chip, index);
  }

  label(
    column: ColumnId,
    cell: { note: number | null; cut: boolean; instrumentId: string | null; volume: number | null; effect: CellEffect | null },
  ): string {
    if (column === 'note') {
      if (cell.cut) return 'OFF';
      if (cell.note === null) return '---';
      return formatNote(cell.note);
    }
    if (column === 'instrument') {
      return this.instrumentNumberLabel(cell.instrumentId);
    }
    if (column === 'effect') {
      return formatEffect(cell.effect, this.project().chip);
    }
    return cell.volume === null ? '..' : cell.volume.toString(16).toUpperCase();
  }

  /** Short id shown in the instrument column and beside names in the studio list. */
  instrumentNumberLabel(instrumentId: string | null): string {
    if (!instrumentId) {
      return '.';
    }
    return instrumentId.replace(/^ins-/, '').replace(/^snip-/, 's');
  }

  columnTooltip(column: ColumnId): string {
    if (column === 'note') {
      return 'Note — piano keys write pitch; ` / ~ = cut (OFF)';
    }
    if (column === 'instrument') {
      return 'Instrument — type the panel number (1–9…) to assign; 0 clears';
    }
    if (column === 'volume') {
      return 'Volume — hex 0–F; .. = use instrument level';
    }
    return this.effectColumnTitle();
  }

  effectColumnTitle(): string {
    return effectColumnHint(this.project().chip);
  }

  toggleFxReference(): void {
    this.fxReferenceOpen.update((open) => !open);
  }

  closeFxReference(): void {
    this.fxReferenceOpen.set(false);
  }

  private syncArmedFromCursor(): void {
    const body = this.songBody();
    const cursor = this.state().cursor;
    const patternId = body.order[cursor.orderIndex];
    const pattern = body.patterns.find((item) => item.id === patternId) ?? body.patterns[0];
    const cell = pattern?.rows[cursor.row]?.[cursor.channel];
    if (cell?.instrumentId && cell.instrumentId !== this.project().armedInstrumentId) {
      this.session.arm(cell.instrumentId);
    }
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
    if (key === 'ArrowUp') {
      this.session.move(-1, 0, 0);
      this.syncArmedFromCursor();
    } else if (key === 'ArrowDown') {
      this.session.move(1, 0, 0);
      this.syncArmedFromCursor();
    } else if (key === 'ArrowLeft') {
      this.session.move(0, 0, -1);
      this.syncArmedFromCursor();
    } else if (key === 'ArrowRight') {
      this.session.move(0, 0, 1);
      this.syncArmedFromCursor();
    } else if (key === 'Backspace' || key === 'Delete') {
      if (!this.auditionOnly()) {
        this.session.clear();
      }
    } else if (key === '`' || key === '~') {
      if (!this.auditionOnly()) {
        this.session.enterCut();
      }
    } else if (key === '[' || key === ']') {
      this.session.octave(this.state().octave + (key === ']' ? 1 : -1));
    } else if (key === '?' && this.project().chip === 'gameboy') {
      event.preventDefault();
      this.toggleFxReference();
    } else if (!this.auditionOnly() && this.state().cursor.column === 'instrument') {
      this.enterInstrumentKey(key);
    } else if (!this.auditionOnly() && this.state().cursor.column === 'volume' && /^[0-9a-f]$/i.test(key)) {
      this.session.volume(parseInt(key, 16));
    } else if (!this.auditionOnly() && this.state().cursor.column === 'effect') {
      this.enterEffectKey(key);
    } else if (this.auditionOnly() || this.state().cursor.column === 'note') {
      const midi = noteFromKey(key.toLowerCase(), this.state().octave);
      if (midi !== null) {
        this.auditionMidi(midi);
        if (!this.auditionOnly()) {
          this.session.enterNote(midi);
          this.syncArmedFromCursor();
        }
      }
    }
  }

  /** While the editor is open, piano keys only audition; they never write cells. */
  private auditionOnly(): boolean {
    return this.studioFocused() || this.instrumentEditorOpen();
  }

  private enterInstrumentKey(key: string): void {
    if (key === '0') {
      this.session.cellInstrument(null);
      return;
    }
    if (!/^[1-9a-f]$/i.test(key)) {
      return;
    }
    const id = findInstrumentIdByNumberLabel(this.project(), key);
    if (id) {
      this.session.cellInstrument(id);
    }
  }

  auditionMidi(midi: number): void {
    this.lastAuditionMidi.set(midi);
    this.playback.audition(this.song(), midi);
  }

  auditionNoteOffset(semitone: number): void {
    const midi = Math.min(108, Math.max(24, this.state().octave * 12 + semitone));
    this.auditionMidi(midi);
  }

  cycleLoop(): void {
    const index = this.loopCycle.indexOf(this.loop());
    this.loop.set(this.loopCycle[(index + 1) % this.loopCycle.length]);
  }

  play(fromCursor: boolean): void {
    this.radio.stop();
    const state = this.state();
    this.playback.play(
      songForRender(state.project),
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
    this.playback.setMuteSolo(this.muted(), this.solo());
  }

  fieldValue(key: string): string | number | boolean {
    if (isFmPatchFieldKey(key)) {
      return fmFieldValue(this.armed(), key);
    }
    const instrument = this.armed() as unknown as Record<string, string | number | boolean | null>;
    return instrument[key] ?? '';
  }

  numericField(key: string): number {
    const value = this.fieldValue(key);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  macroText(key: string): string {
    const instrument = this.armed() as unknown as Record<string, unknown>;
    const macro = instrument[key];
    if (!Array.isArray(macro) || macro.length === 0) {
      return '';
    }
    return macro.map((step) => Number(step).toString(16).toUpperCase()).join(' ');
  }

  knobAngle(key: string, min: number, max: number): number {
    const span = Math.max(1, max - min);
    const ratio = (this.numericField(key) - min) / span;
    return -135 + ratio * 270;
  }

  startKnobDrag(event: PointerEvent, key: string, min: number, max: number): void {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.knobDrag = {
      key,
      min,
      max,
      startY: event.clientY,
      startValue: this.numericField(key),
    };
    window.addEventListener('pointermove', this.onKnobPointerMove);
    window.addEventListener('pointerup', this.onKnobPointerUp);
  }

  private moveKnobDrag(event: PointerEvent): void {
    if (!this.knobDrag) {
      return;
    }
    const { key, min, max, startY, startValue } = this.knobDrag;
    const span = Math.max(1, max - min);
    const pixelsPerStep = Math.max(2, 120 / span);
    const delta = Math.round((startY - event.clientY) / pixelsPerStep);
    const next = Math.min(max, Math.max(min, startValue + delta));
    this.patchField(key, String(next), 'number', true);
  }

  private endKnobDrag(): void {
    this.knobDrag = null;
    window.removeEventListener('pointermove', this.onKnobPointerMove);
    window.removeEventListener('pointerup', this.onKnobPointerUp);
    if (!this.playback.playing()) {
      this.auditionMidi(this.lastAuditionMidi());
    }
  }

  patchMacro(key: string, raw: string, min: number, max: number): void {
    const steps = raw
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((token) => {
        let parsed: number;
        if (/^[+-]?\d+$/.test(token)) {
          parsed = Number(token);
        } else if (/^[0-9a-fA-F]+$/.test(token)) {
          parsed = Number.parseInt(token, 16);
        } else {
          return null;
        }
        if (!Number.isFinite(parsed)) {
          return null;
        }
        return Math.min(max, Math.max(min, Math.round(parsed)));
      })
      .filter((step): step is number => step !== null);
    this.session.updateInstrument(this.armed().id, {
      [key]: steps.length > 0 ? steps : null,
    } as Partial<Instrument>);
    this.afterInstrumentPatch();
  }

  patchField(key: string, raw: string, control: string, live = false): void {
    let value: string | number | boolean = raw;
    if (control === 'number' || control === 'select') {
      value = Number(raw);
      if (!Number.isFinite(value)) {
        return;
      }
    }
    if (control === 'toggle') {
      value = raw === 'true';
    }
    const patch = isFmPatchFieldKey(key)
      ? patchFmField(this.armed(), key, typeof value === 'string' ? Number(value) : value)
      : ({ [key]: value } as Partial<Instrument>);
    this.session.updateInstrument(this.armed().id, patch);
    this.afterInstrumentPatch(live);
  }

  operatorValue(index: number, key: keyof FmOperator): number {
    return this.fmOperators()[index]?.values[key] ?? 0;
  }

  patchOperator(index: number, key: keyof FmOperator, raw: string, live = false): void {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return;
    }
    this.session.updateInstrument(
      this.armed().id,
      patchFmOperator(this.armed(), index, key, value),
    );
    this.afterInstrumentPatch(live);
  }

  private afterInstrumentPatch(live = false): void {
    if (this.playback.playing()) {
      this.scheduleHotReload();
      return;
    }
    if (!live || !this.knobDrag) {
      this.auditionMidi(this.lastAuditionMidi());
      return;
    }
    this.auditionMidi(this.lastAuditionMidi());
  }

  private scheduleHotReload(): void {
    if (this.hotReloadFrame !== null) {
      return;
    }
    this.hotReloadFrame = window.requestAnimationFrame(() => {
      this.hotReloadFrame = null;
      this.playback.hotReload(this.song());
    });
  }

  changeKind(raw: string): void {
    this.session.changeInstrumentKind(this.armed().id, raw as InstrumentKind);
    this.afterInstrumentPatch();
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
    if (to > from) {
      to -= 1;
    }
    if (to !== from) {
      this.session.reorderOrder(from, to);
    }
  }

  async save(): Promise<void> {
    const { serializeProject: serialize } = await import('@chippy/files');
    const project = this.project();
    const blob = new Blob([serialize(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-') || 'chippy'}.chippy.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.session.markClean();
    this.status.set('Project saved.');
  }

  pickOpenProject(): void {
    const input = this.openProjectInput()?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  onOpenProjectSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.open(input.files?.[0]);
    input.value = '';
  }

  async open(file: File | undefined): Promise<void> {
    if (!file) return;
    if (this.state().dirty) {
      const ok = window.confirm(
        'Opening a project replaces everything on screen. Unsaved work will be lost. Continue?',
      );
      if (!ok) {
        return;
      }
    }
    try {
      const files = await import('@chippy/files');
      const isSav = /\.sav$/i.test(file.name);
      if (isSav) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const decoded = files.decodeLsdjSav(buffer);
        const projectName = file.name.replace(/\.sav$/i, '') || 'LSDJ Import';
        const project = files.projectFromLsdjDecode(decoded, projectName);
        this.playback.stop();
        this.session.load(project);
        this.session.setLsdjOverlay(buffer, decoded.importMap);
        const detail = decoded.warnings.length > 0
          ? ` ${decoded.warnings.join(' ')}`
          : '';
        this.status.set(
          `Opened LSDJ .sav (Game Boy, format v${decoded.formatVersion}). `
          + `Chains flattened into Song Order for editing; re-export patches in place.${detail}`,
        );
        return;
      }
      const text = await file.text();
      const project = files.parseProject(text);
      this.playback.stop();
      this.session.load(project);
      this.session.clearLsdjOverlay();
      this.status.set('Opened project.');
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : 'That file was rejected.');
    }
  }

  toggleExport(event: Event): void {
    event.stopPropagation();
    this.exportOpen.update((open) => !open);
  }

  @HostListener('document:click')
  closeExportMenu(): void {
    if (this.exportOpen()) {
      this.exportOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.fxReferenceOpen()) {
      this.closeFxReference();
      return;
    }
    if (this.presetsOpen()) {
      this.closePresetsModal();
      return;
    }
    if (this.instrumentEditorOpen()) {
      this.closeInstrumentEditor();
      return;
    }
    if (this.exportOpen()) {
      this.exportOpen.set(false);
    }
  }

  async exportFile(kind: 'wav' | 'ym' | 'vgm' | 'aky' | 'sav'): Promise<void> {
    this.exportOpen.set(false);
    try {
      const files = await import('@chippy/files');
      const song = this.song();
      const aky = kind === 'aky' ? files.exportAky(song) : null;
      const baseSav = this.session.lsdjSavBase();
      const importMap = this.session.lsdjImportMap();
      const bundles = kind === 'wav' ? [files.exportWav(song)]
        : kind === 'ym' ? [files.exportYm(song)]
        : kind === 'vgm' ? [files.exportVgm(song)]
        : kind === 'sav' ? [files.exportLsdjSav(song, {
          baseSav,
          importMap,
          modified: this.state().dirty,
        })]
        : [aky!.songFile, aky!.configFile];
      bundles.forEach((bundle) => this.download(bundle.bytes, bundle.filename, bundle.mime));
      this.status.set(
        kind === 'sav'
          ? files.lsdjSavCompatibilityStatus({
            baseSav,
            structurePreserved: files.lsdjImportMapAligned(song, importMap),
          })
          : 'Export ready.',
      );
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

  sessionName(value: string): void {
    this.session.name(value);
  }

  sessionTempo(value: string): void {
    this.session.tempo(Number(value));
  }

  place(row: number, channel: number, column: ColumnId): void {
    this.studioFocused.set(false);
    this.session.place(row, channel, column);
    this.syncArmedFromCursor();
  }

  private enterEffectKey(key: string): void {
    const chip = this.project().chip;
    const upper = key.toUpperCase();
    const pattern = this.pattern();
    const cursor = this.state().cursor;
    const existing = pattern.rows[cursor.row][cursor.channel]?.effect ?? null;
    const cmds = effectCmdsForChip(chip);
    if (isEffectCmdForChip(chip, upper)) {
      this.session.effect({ cmd: upper as EffectCmd, value: existing?.value ?? 0 });
      return;
    }
    if (/^[0-9a-f]$/i.test(key)) {
      const nibble = parseInt(key, 16);
      const fallbackCmd = (cmds[0] ?? 'A') as EffectCmd;
      const cmd = existing?.cmd && isEffectCmdForChip(chip, existing.cmd) ? existing.cmd : fallbackCmd;
      if (chip === 'gameboy') {
        const value = (((existing?.value ?? 0) << 4) | nibble) & 0xff;
        this.session.effect({ cmd, value });
      } else {
        this.session.effect({ cmd, value: nibble });
      }
    }
  }

  chipChange(id: string): void {
    if (!isChipId(id)) {
      return;
    }
    if (id === this.project().chip) {
      return;
    }
    const continueSwitch = window.confirm(
      'Changing chip starts a blank project for the new chip. Your current songs, patterns, and instruments leave this screen.\n\nOK = continue\nCancel = stay on this chip',
    );
    if (!continueSwitch) {
      this.chipSelectEpoch.update((value) => value + 1);
      return;
    }
    const saveFirst = window.confirm(
      'Save your current project and instruments before switching?\n\nOK = Save, then switch\nCancel = Discard and switch',
    );
    void this.finishChipChange(id, saveFirst);
  }

  private async finishChipChange(id: ChipId, saveFirst: boolean): Promise<void> {
    if (saveFirst) {
      await this.save();
    }
    this.playback.stop();
    this.muted.set(new Set());
    this.solo.set(new Set());
    this.playback.setMuteSolo(new Set(), new Set());
    this.session.newProjectForChip(id);
    this.status.set(
      saveFirst
        ? `Saved, then started a new ${chipLabel(id)} project.`
        : `Discarded previous project. New ${chipLabel(id)} project.`,
    );
  }

  openPresetsModal(): void {
    this.presetSearch.set('');
    this.presetStatus.set('');
    this.presetsOpen.set(true);
  }

  closePresetsModal(): void {
    this.presetsOpen.set(false);
    this.presetSearch.set('');
  }

  addPresetEntry(entry: PresetMenuEntry): void {
    if (entry.custom) {
      this.session.addFromCustomPreset(entry.id);
    } else if (entry.premium && !this.premiumUnlocked()) {
      this.presetStatus.set('Premium preset — unlock via Support Chippy (or set presets.unlockAll in config).');
      return;
    } else {
      this.session.addFromPreset(entry.source as InstrumentPreset);
    }
    this.closePresetsModal();
    this.status.set(`Added ${entry.name}.`);
    this.auditionMidi(this.lastAuditionMidi());
  }

  async exportArmedInstrument(): Promise<void> {
    const { serializeInstrumentFile, instrumentDownloadName } = await import('@chippy/files');
    const instrument = this.armed();
    const text = serializeInstrumentFile(
      instrument,
      this.project().chip,
      defaultRoleForKind(instrument.kind),
    );
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = instrumentDownloadName(instrument.name);
    link.click();
    URL.revokeObjectURL(url);
    this.status.set(`Exported “${instrument.name}”.`);
  }

  pickImportInstrument(): void {
    const input = this.importInstrumentInput()?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  onImportInstrumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    void this.importInstrumentFile(file);
  }

  private async importInstrumentFile(file: File): Promise<void> {
    try {
      const { parseInstrumentFile } = await import('@chippy/files');
      const text = await file.text();
      const preset = parseInstrumentFile(text);
      if (preset.chip !== this.project().chip) {
        this.status.set(
          `That instrument is for ${preset.chip}, but this project is ${this.project().chip}.`,
        );
        return;
      }
      const before = this.project().customPresets?.length ?? 0;
      this.session.importCustomPreset(preset);
      const after = this.project().customPresets?.length ?? 0;
      if (after <= before) {
        this.status.set('Could not import that instrument.');
        return;
      }
      this.status.set(`Imported “${preset.name}”.`);
      this.auditionMidi(this.lastAuditionMidi());
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : 'That instrument file was rejected.');
    }
  }

  removeCustomEntry(entry: PresetMenuEntry, event: Event): void {
    event.stopPropagation();
    if (!entry.custom) {
      return;
    }
    this.session.removeCustomPreset(entry.id);
    this.presetStatus.set(`Removed custom preset “${entry.name}”.`);
  }

  deleteArmed(): void {
    if (this.project().instruments.length <= 1) {
      this.status.set('Keep at least one instrument.');
      return;
    }
    this.session.deleteInstrument(this.armed().id);
  }
}
