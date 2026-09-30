export interface CoffeeConfig {
  enabled: boolean;
  url: string;
  delayMinutes: number;
  title: string;
  body: string;
  acceptLabel: string;
  dismissLabel: string;
}

export interface AdsConfig {
  enabled: boolean;
  provider: string;
  clientId: string;
  slotId: string;
}

export interface PresetsConfig {
  /** When true, premium instrument packs unlock without a support perk. */
  unlockAll: boolean;
}

export interface AppConfig {
  splashEnabled: boolean;
  coffee: CoffeeConfig;
  ads: AdsConfig;
  presets: PresetsConfig;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  splashEnabled: true,
  coffee: {
    enabled: false,
    url: '',
    delayMinutes: 5,
    title: 'Hey! If you are enjoying this please consider buying me a coffee...',
    body: 'It will help pay server costs to keep this running and free for everyone!!!',
    acceptLabel: 'Alright!',
    dismissLabel: 'Maybe Later',
  },
  ads: {
    enabled: false,
    provider: 'adsense',
    clientId: '',
    slotId: '',
  },
  presets: {
    unlockAll: true,
  },
};

export function normalizeAppConfig(raw: Partial<AppConfig> | null | undefined): AppConfig {
  const coffee = raw?.coffee ?? {};
  const ads = raw?.ads ?? {};
  const presets = raw?.presets ?? {};
  const delay = Number((coffee as CoffeeConfig).delayMinutes);
  return {
    splashEnabled: raw?.splashEnabled !== false,
    coffee: {
      enabled: Boolean((coffee as CoffeeConfig).enabled),
      url: String((coffee as CoffeeConfig).url ?? ''),
      delayMinutes: Number.isFinite(delay) && delay >= 1 ? Math.floor(delay) : 5,
      title: String((coffee as CoffeeConfig).title ?? DEFAULT_APP_CONFIG.coffee.title),
      body: String((coffee as CoffeeConfig).body ?? DEFAULT_APP_CONFIG.coffee.body),
      acceptLabel: String((coffee as CoffeeConfig).acceptLabel ?? DEFAULT_APP_CONFIG.coffee.acceptLabel),
      dismissLabel: String((coffee as CoffeeConfig).dismissLabel ?? DEFAULT_APP_CONFIG.coffee.dismissLabel),
    },
    ads: {
      enabled: Boolean((ads as AdsConfig).enabled),
      provider: String((ads as AdsConfig).provider || 'adsense'),
      clientId: String((ads as AdsConfig).clientId ?? ''),
      slotId: String((ads as AdsConfig).slotId ?? ''),
    },
    presets: {
      unlockAll: (presets as PresetsConfig).unlockAll !== false,
    },
  };
}
