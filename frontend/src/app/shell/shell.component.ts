import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AestheticService, type AestheticId } from '../aesthetic.service';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  readonly aesthetics = inject(AestheticService);

  theme(id: string): void {
    if (id === 'vaporwave' || id === 'dark' || id === 'plain') {
      this.aesthetics.select(id as AestheticId);
    }
  }
}
