import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RadioPlayerService } from './radio-player.service';

@Component({
  selector: 'app-radio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './radio.component.html',
  styleUrl: './radio.component.css',
})
export class RadioComponent implements AfterViewInit, OnDestroy {
  readonly radio = inject(RadioPlayerService);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('viz');
  private frame = 0;
  private readonly bins = new Uint8Array(new ArrayBuffer(128));
  private phase = 0;

  constructor() {
    effect(() => {
      // Re-kick the draw loop when play state or viz wiring changes.
      void this.radio.playing();
      void this.radio.vizEnabled();
      this.kickDraw();
    });
  }

  ngAfterViewInit(): void {
    this.kickDraw();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.radio.stop();
  }

  selectPreset(id: string): void {
    this.radio.select(id);
    if (!this.radio.playing()) {
      void this.radio.play();
    }
  }

  togglePower(): void {
    if (this.radio.playing()) {
      this.radio.stop();
    } else {
      void this.radio.play();
    }
  }

  private kickDraw(): void {
    cancelAnimationFrame(this.frame);
    const draw = () => {
      this.paintViz();
      this.frame = requestAnimationFrame(draw);
    };
    this.frame = requestAnimationFrame(draw);
  }

  private paintViz(): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const styles = getComputedStyle(document.documentElement);
    const sky = styles.getPropertyValue('--sky').trim() || '#140c24';
    const cyan = styles.getPropertyValue('--cyan').trim() || '#79f6ff';
    const magenta = styles.getPropertyValue('--magenta').trim() || '#ff3ec8';
    const cell = styles.getPropertyValue('--cell').trim() || '#160f28';

    ctx.fillStyle = cell;
    ctx.fillRect(0, 0, width, height);

    const live = this.radio.frequencyData(this.bins);
    const playing = this.radio.playing();
    this.phase += playing ? 0.08 : 0.02;
    let peak = 0;
    if (live) {
      for (let i = 0; i < this.bins.length; i++) {
        if (this.bins[i] > peak) peak = this.bins[i];
      }
    }
    const useLive = live && playing && peak > 8;

    const barCount = 48;
    const gap = 2;
    const barWidth = (width - gap * (barCount + 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      let level: number;
      if (useLive) {
        const index = Math.floor((i / barCount) * this.bins.length);
        level = this.bins[index] / 255;
      } else {
        const wave = 0.25 + 0.2 * Math.sin(this.phase + i * 0.35);
        level = playing ? wave + 0.15 * Math.sin(this.phase * 1.7 + i) : wave * 0.45;
      }
      const barHeight = Math.max(3, level * (height - 8));
      const x = gap + i * (barWidth + gap);
      const y = height - barHeight - 4;
      const gradient = ctx.createLinearGradient(0, y, 0, height);
      gradient.addColorStop(0, cyan);
      gradient.addColorStop(1, magenta);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.35 + level * 0.65;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = cyan;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (let x = 0; x < width; x += 2) {
      const y = height * 0.5 + Math.sin(x * 0.04 + this.phase) * (playing ? 10 : 4);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Soft scanline wash so the glass keeps vaporwave haze.
    ctx.fillStyle = sky;
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.globalAlpha = 1;
  }
}
