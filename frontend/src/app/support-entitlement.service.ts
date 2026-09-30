import { Injectable, inject } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class SupportEntitlementService {
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  shouldShowCoffeePrompt(): boolean {
    const coffee = this.config.config().coffee;
    return coffee.enabled && coffee.url.trim().length > 0 && !this.auth.hasSupportPerk();
  }

  shouldShowAds(): boolean {
    const ads = this.config.config().ads;
    return ads.enabled
      && ads.clientId.trim().length > 0
      && ads.slotId.trim().length > 0
      && !this.auth.hasSupportPerk();
  }

  /** Premium instrument packs: support perk or local unlockAll flag. */
  canUsePremiumPresets(): boolean {
    return this.auth.hasSupportPerk() || this.config.config().presets.unlockAll;
  }
}
