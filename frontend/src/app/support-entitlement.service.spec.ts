import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_CONFIG, type AppConfig } from './app-config';
import type { AuthService } from './auth';

describe('SupportEntitlementService', () => {
  async function entitlement(config: AppConfig, hasPerk: boolean) {
    vi.resetModules();
    const { SupportEntitlementService } = await import('./support-entitlement.service');
    const configSignal = signal(config);
    const auth = {
      canActivate: () => true,
      hasSupportPerk: () => hasPerk,
    } as AuthService;
    return Object.assign(Object.create(SupportEntitlementService.prototype), {
      config: { config: configSignal.asReadonly() },
      auth,
    }) as InstanceType<typeof SupportEntitlementService>;
  }

  it('shows coffee only when enabled with a url and no perk', async () => {
    const off = await entitlement(DEFAULT_APP_CONFIG, false);
    expect(off.shouldShowCoffeePrompt()).toBe(false);
    const on = await entitlement({
      ...DEFAULT_APP_CONFIG,
      coffee: { ...DEFAULT_APP_CONFIG.coffee, enabled: true, url: 'https://www.buymeacoffee.com/x' },
    }, false);
    expect(on.shouldShowCoffeePrompt()).toBe(true);
    const donor = await entitlement({
      ...DEFAULT_APP_CONFIG,
      coffee: { ...DEFAULT_APP_CONFIG.coffee, enabled: true, url: 'https://www.buymeacoffee.com/x' },
    }, true);
    expect(donor.shouldShowCoffeePrompt()).toBe(false);
  });

  it('hides ads for donors even when ads are configured', async () => {
    const adsOn: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      ads: { enabled: true, provider: 'adsense', clientId: 'ca-pub-1', slotId: '9' },
    };
    expect((await entitlement(adsOn, false)).shouldShowAds()).toBe(true);
    expect((await entitlement(adsOn, true)).shouldShowAds()).toBe(false);
  });

  it('unlocks premium presets via perk or unlockAll', async () => {
    const locked: AppConfig = {
      ...DEFAULT_APP_CONFIG,
      presets: { unlockAll: false },
    };
    expect((await entitlement(locked, false)).canUsePremiumPresets()).toBe(false);
    expect((await entitlement(locked, true)).canUsePremiumPresets()).toBe(true);
    expect((await entitlement(DEFAULT_APP_CONFIG, false)).canUsePremiumPresets()).toBe(true);
  });
});
