import { describe, expect, it } from 'vitest';
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
});
