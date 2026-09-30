import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdSlotComponent } from './ad-slot.component';
import { AppConfigService } from './app-config.service';
import { CoffeePromptComponent } from './coffee-prompt.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CoffeePromptComponent, AdSlotComponent],
  template: `
    <router-outlet />
    <app-coffee-prompt />
    <app-ad-slot />
  `,
})
export class AppComponent implements OnInit {
  private readonly config = inject(AppConfigService);

  constructor() {
    window.chippyReady = true;
    window.dispatchEvent(new Event('chippy-ready'));
  }

  ngOnInit(): void {
    void this.config.load();
  }
}

declare global {
  interface Window {
    chippyReady?: boolean;
  }
}
