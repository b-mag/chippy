import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { SupportEntitlementService } from './support-entitlement.service';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

@Component({
  selector: 'app-ad-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <aside class="ad-slot" aria-label="Sponsored">
        <ins
          class="adsbygoogle"
          style="display:block"
          [attr.data-ad-client]="config.config().ads.clientId"
          [attr.data-ad-slot]="config.config().ads.slotId"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
      </aside>
    }
  `,
  styles: `
    .ad-slot {
      position: fixed;
      left: 12px;
      bottom: 12px;
      width: min(20rem, calc(100% - 24px));
      max-height: 6rem;
      overflow: hidden;
      z-index: 15;
      background: var(--chrome);
      border: 1px solid var(--cell-edge);
      border-radius: 8px;
      opacity: 0.92;
    }
  `,
})
export class AdSlotComponent implements OnInit, OnDestroy {
  readonly config = inject(AppConfigService);
  private readonly entitlement = inject(SupportEntitlementService);
  readonly active = signal(false);
  private script: HTMLScriptElement | null = null;

  ngOnInit(): void {
    void this.config.load().then(() => this.mount());
  }

  ngOnDestroy(): void {
    this.script?.remove();
    this.script = null;
  }

  private mount(): void {
    if (!this.entitlement.shouldShowAds()) {
      this.active.set(false);
      return;
    }
    this.active.set(true);
    queueMicrotask(() => this.loadScript());
  }

  private loadScript(): void {
    const clientId = this.config.config().ads.clientId.trim();
    if (!clientId || document.querySelector('script[data-chippy-adsense]')) {
      this.pushAd();
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    script.crossOrigin = 'anonymous';
    script.dataset['chippyAdsense'] = '1';
    script.onload = () => this.pushAd();
    document.head.appendChild(script);
    this.script = script;
  }

  private pushAd(): void {
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      /* AdSense may throw when blocked */
    }
  }
}
