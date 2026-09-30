import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_APP_CONFIG, normalizeAppConfig, type AppConfig } from './app-config';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  private readonly configSignal = signal<AppConfig>(DEFAULT_APP_CONFIG);
  private loadPromise: Promise<AppConfig> | null = null;

  readonly config = this.configSignal.asReadonly();

  load(): Promise<AppConfig> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = firstValueFrom(this.http.get<Partial<AppConfig>>('/config.json'))
      .then((raw) => {
        const normalized = normalizeAppConfig(raw);
        this.configSignal.set(normalized);
        return normalized;
      })
      .catch(() => {
        this.configSignal.set(DEFAULT_APP_CONFIG);
        return DEFAULT_APP_CONFIG;
      });
    return this.loadPromise;
  }
}
