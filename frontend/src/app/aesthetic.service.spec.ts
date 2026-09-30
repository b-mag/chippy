import { describe, expect, it, vi } from 'vitest';
import { AestheticService } from './aesthetic.service';

describe('aesthetic', () => {
  it('sets the root token and keeps the choice for the next load', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    const root = { dataset: {} as DOMStringMap };
    const service = Object.create(AestheticService.prototype) as AestheticService;
    service.apply('dark', storage, root);
    expect(root.dataset['aesthetic']).toBe('dark');
    const again = Object.create(AestheticService.prototype) as AestheticService;
    expect(again.read(storage)).toBe('dark');
  });

  it('falls back to vaporwave for an unknown paint choice', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    const root = { dataset: {} as DOMStringMap };
    const service = Object.create(AestheticService.prototype) as AestheticService;
    service.apply('neon' as never, storage, root);
    expect(root.dataset['aesthetic']).toBe('vaporwave');
    expect(service.read(storage)).toBe('vaporwave');
  });

  it('select writes through localStorage and document', () => {
    const store = new Map<string, string>([['chippy-aesthetic', 'plain']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    });
    const root = { dataset: {} as DOMStringMap };
    vi.stubGlobal('document', { documentElement: root });
    const service = new AestheticService();
    expect(service.current()).toBe('plain');
    service.select('dark');
    expect(service.current()).toBe('dark');
    expect(root.dataset['aesthetic']).toBe('dark');
    vi.unstubAllGlobals();
  });
});
