import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { I18nService, Locale } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'mm-public-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="mm-container header__inner">
        <a routerLink="/" class="brand">{{ 'app.name' | t }}</a>

        <div class="header__actions">
          <label class="lang">
            <span class="visually-hidden">Language</span>
            <select [value]="i18n.locale()" (change)="onLocaleChange($event)">
              <option value="ka">{{ 'language.ka' | t }}</option>
              <option value="en">{{ 'language.en' | t }}</option>
            </select>
          </label>
        </div>
      </div>
    </header>

    <main class="mm-container main">
      <router-outlet />
    </main>

    <footer class="footer">
      <div class="mm-container">
        <small>{{ 'footer.rights' | t: { year: year } }}</small>
      </div>
    </footer>
  `,
  styles: `
    .header {
      background: var(--mm-charcoal);
      color: var(--mm-warm-white);
    }
    .header__inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
    }
    .brand {
      font-family: var(--mm-font-display);
      font-size: 1.5rem;
      letter-spacing: 0.02em;
    }
    .lang select {
      background: transparent;
      color: inherit;
      border: 1px solid var(--mm-gray-500);
      border-radius: var(--mm-radius);
      padding: 6px 10px;
      font: inherit;
    }
    .lang option {
      color: var(--mm-charcoal);
    }
    .main {
      min-height: 60vh;
      padding-top: var(--mm-space-5);
      padding-bottom: var(--mm-space-5);
    }
    .footer {
      border-top: 1px solid var(--mm-gray-300);
      padding: var(--mm-space-4) 0;
      color: var(--mm-gray-700);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class PublicLayoutComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly year = new Date().getFullYear();

  protected onLocaleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as Locale;
    void this.i18n.setLocale(value);
  }
}
