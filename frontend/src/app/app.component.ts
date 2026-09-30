import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {
  constructor() {
    window.chippyReady = true;
    window.dispatchEvent(new Event('chippy-ready'));
  }
}

declare global {
  interface Window {
    chippyReady?: boolean;
  }
}
