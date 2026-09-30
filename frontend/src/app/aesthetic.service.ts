import { Injectable, signal } from '@angular/core';

export type AestheticId = 'vaporwave' | 'dark' | 'plain';

const STORAGE_KEY = 'chippy-aesthetic';
const CHOICES: AestheticId[] = ['vaporwave', 'dark', 'plain'];

@Injectable({ providedIn: 'root' })
export class AestheticService {
  readonly current = signal<AestheticId>('vaporwave');
  readonly choices = CHOICES;

  constructor() {
    const stored = this.read(localStorage);
    this.apply(stored, localStorage, document.documentElement);
  }

  select(id: AestheticId): void {
    this.apply(id, localStorage, document.documentElement);
  }

  /** Applies the paint token and remembers it. Used by the unit test with fakes. */
  apply(id: AestheticId, storage: Pick<Storage, 'getItem' | 'setItem'>, root: { dataset: DOMStringMap }): void {
    const choice = CHOICES.includes(id) ? id : 'vaporwave';
    root.dataset['aesthetic'] = choice;
    storage.setItem(STORAGE_KEY, choice);
    this.current?.set(choice);
  }

  read(storage: Pick<Storage, 'getItem'>): AestheticId {
    const value = storage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'plain' || value === 'vaporwave' ? value : 'vaporwave';
  }
}
