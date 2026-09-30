import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { SupportEntitlementService } from './support-entitlement.service';

const SESSION_KEY = 'chippy-coffee-prompt-shown';

@Component({
  selector: 'app-coffee-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside class="coffee" role="dialog" aria-label="Support Chippy">
        <h2>{{ config.config().coffee.title }}</h2>
        <p>{{ config.config().coffee.body }}</p>
        <div class="actions">
          <button type="button" (click)="accept()">{{ config.config().coffee.acceptLabel }}</button>
          <button type="button" (click)="dismiss()">{{ config.config().coffee.dismissLabel }}</button>
        </div>
      </aside>
    }
  `,
  styles: `
    .coffee {
      position: fixed;
      inset: auto 16px 16px auto;
      width: min(22rem, calc(100% - 32px));
      padding: 16px;
      z-index: 20;
      background: var(--chrome);
      border: 1px solid var(--cell-edge);
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }
    .coffee h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
    }
    .coffee p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class CoffeePromptComponent implements OnInit, OnDestroy {
  readonly config = inject(AppConfigService);
  private readonly entitlement = inject(SupportEntitlementService);
  readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    void this.config.load().then(() => this.schedule());
  }

  ngOnDestroy(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
  }

  accept(): void {
    const url = this.config.config().coffee.url.trim();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    this.dismiss();
  }

  dismiss(): void {
    this.visible.set(false);
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  private schedule(): void {
    if (!this.entitlement.shouldShowCoffeePrompt() || this.alreadyShown()) {
      return;
    }
    const delayMs = this.config.config().coffee.delayMinutes * 60_000;
    this.timer = setTimeout(() => {
      if (this.entitlement.shouldShowCoffeePrompt() && !this.alreadyShown()) {
        this.visible.set(true);
      }
    }, delayMs);
  }

  private alreadyShown(): boolean {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }
}
