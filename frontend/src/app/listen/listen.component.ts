import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AyFrame } from '@chippy/engines';
import { PlaybackService } from '../playback.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-listen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './listen.component.html',
})
export class ListenComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly playback = inject(PlaybackService);
  private readonly router = inject(Router);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('timeline');

  readonly status = signal('Open a YM. The song you are writing stays put until you keep a snip.');
  readonly name = signal('');
  readonly snipName = signal('Snip');
  frames: AyFrame[] = [];
  frameRate = 50;
  readonly start = signal(0);
  readonly end = signal(0);
  private drag: 'start' | 'end' | null = null;

  open(file: File | undefined): void {
    if (!file) {
      return;
    }
    const body = new FormData();
    body.set('file', file);
    this.http.post<{ ymBase64: string }>('/api/ym/validate', body).subscribe({
      next: async (response) => {
        const files = await import('@chippy/files');
        const binary = Uint8Array.from(atob(response.ymBase64), (char) => char.charCodeAt(0));
        const parsed = files.parseYm(binary);
        this.frames = parsed.frames;
        this.frameRate = parsed.frameRate || 50;
        this.name.set(parsed.name);
        this.start.set(0);
        this.end.set(Math.max(0, parsed.frames.length - 1));
        this.status.set(`${parsed.frames.length} frames ready.`);
        this.draw();
      },
      error: () => this.status.set('That YM was rejected.'),
    });
  }

  play(): void {
    if (this.frames.length === 0) {
      return;
    }
    this.playback.playFrames(this.frames, this.frameRate, this.start(), this.end());
  }

  stop(): void {
    this.playback.stop();
  }

  keep(): void {
    const slice = this.frames.slice(this.start(), this.end() + 1);
    if (slice.length === 0) {
      return;
    }
    this.session.commitSnip(this.snipName(), slice);
    this.playback.stop();
    void this.router.navigateByUrl('/');
  }

  pointerDown(event: PointerEvent): void {
    if (this.frames.length === 0) {
      return;
    }
    const frame = this.frameAt(event);
    this.drag = Math.abs(frame - this.start()) <= Math.abs(frame - this.end()) ? 'start' : 'end';
    this.moveDrag(frame);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  pointerMove(event: PointerEvent): void {
    if (!this.drag) {
      return;
    }
    this.moveDrag(this.frameAt(event));
  }

  pointerUp(): void {
    this.drag = null;
  }

  draw(): void {
    const element = this.canvas()?.nativeElement;
    if (!element) {
      return;
    }
    const width = element.width = element.clientWidth * 2;
    const height = element.height = 160;
    const context = element.getContext('2d');
    if (!context || this.frames.length === 0) {
      return;
    }
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#79f6ff';
    context.beginPath();
    this.frames.forEach((frame, index) => {
      const volume = Math.max(frame[8] & 0x0f, frame[9] & 0x0f, frame[10] & 0x0f);
      const x = (index / this.frames.length) * width;
      const y = height - (volume / 15) * (height - 8);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    const mark = (frame: number, color: string) => {
      const x = (frame / this.frames.length) * width;
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    };
    mark(this.start(), '#ff3ec8');
    mark(this.end(), '#ffe1a8');
  }

  private frameAt(event: PointerEvent): number {
    const element = this.canvas()?.nativeElement;
    if (!element || this.frames.length === 0) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.min(this.frames.length - 1, Math.floor(ratio * this.frames.length));
  }

  private moveDrag(frame: number): void {
    if (this.drag === 'start') {
      this.start.set(Math.min(frame, this.end()));
    } else if (this.drag === 'end') {
      this.end.set(Math.max(frame, this.start()));
    }
    this.draw();
  }
}
