import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * Temporary foundation page. The real homepage (configurable sections loaded from the
 * backend) is built in Milestone 4; nothing here is meant to look finished.
 */
@Component({
  selector: 'mm-home',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'home.welcome' | t }}</h1>
    <p>{{ 'home.tagline' | t }}</p>
  `,
})
export class HomeComponent {}
