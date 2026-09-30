import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG, normalizeAppConfig } from './app-config';

describe('normalizeAppConfig', () => {
  it('keeps support features off when the payload is empty', () => {
    const config = normalizeAppConfig({});
    expect(config.coffee.enabled).toBe(false);
    expect(config.ads.enabled).toBe(false);
    expect(config.coffee.delayMinutes).toBe(5);
    expect(config.splashEnabled).toBe(true);
  });

  it('accepts enabled coffee and ads fields', () => {
    const config = normalizeAppConfig({
      splashEnabled: false,
      coffee: {
        enabled: true,
        url: 'https://www.buymeacoffee.com/chippy',
        delayMinutes: 3,
        title: 'Support',
        body: 'Please',
        acceptLabel: 'Ok',
        dismissLabel: 'Later',
      },
      ads: {
        enabled: true,
        provider: 'adsense',
        clientId: 'ca-pub-1',
        slotId: '123',
      },
    });
    expect(config.splashEnabled).toBe(false);
    expect(config.coffee.enabled).toBe(true);
    expect(config.coffee.url).toContain('buymeacoffee');
    expect(config.coffee.delayMinutes).toBe(3);
    expect(config.ads.clientId).toBe('ca-pub-1');
  });

  it('clamps bad delay minutes back to five', () => {
    const config = normalizeAppConfig({
      coffee: { ...DEFAULT_APP_CONFIG.coffee, delayMinutes: 0 },
    });
    expect(config.coffee.delayMinutes).toBe(5);
  });

  it('defaults presets.unlockAll to true and honors false', () => {
    expect(normalizeAppConfig({}).presets.unlockAll).toBe(true);
    expect(normalizeAppConfig({ presets: { unlockAll: false } }).presets.unlockAll).toBe(false);
  });
});
