import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_CONFIG } from './app-config';

describe('AppConfigService.load', () => {
  it('loads and normalizes config.json once', async () => {
    vi.resetModules();
    const { AppConfigService } = await import('./app-config.service');
    const http = {
      get: vi.fn(() => of({
        splashEnabled: true,
        coffee: { enabled: true, url: 'https://ko-fi.com/x', delayMinutes: 2 },
        ads: { enabled: false },
      })),
    };
    const configSignal = signal(DEFAULT_APP_CONFIG);
    const service = Object.assign(Object.create(AppConfigService.prototype), {
      http,
      configSignal,
      loadPromise: null,
      config: configSignal.asReadonly(),
    }) as InstanceType<typeof AppConfigService>;
    const loaded = await service.load();
    expect(loaded.coffee.enabled).toBe(true);
    expect(loaded.coffee.url).toContain('ko-fi');
    expect(loaded.coffee.delayMinutes).toBe(2);
    await service.load();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when config.json fails', async () => {
    vi.resetModules();
    const { AppConfigService } = await import('./app-config.service');
    const http = { get: () => throwError(() => new Error('offline')) };
    const configSignal = signal(DEFAULT_APP_CONFIG);
    const service = Object.assign(Object.create(AppConfigService.prototype), {
      http,
      configSignal,
      loadPromise: null,
      config: configSignal.asReadonly(),
    }) as InstanceType<typeof AppConfigService>;
    const loaded = await service.load();
    expect(loaded).toEqual(DEFAULT_APP_CONFIG);
  });
});
