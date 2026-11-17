import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Locale = (typeof environment.supportedLocales)[number];
type Dictionary = Record<string, string>;

const STORAGE_KEY = 'mm.locale';

/**
 * Lightweight signal-based translation service.
 * Georgian is the default. Content (product titles, descriptions) is translated by
 * sellers in the backend, never auto-translated here; this service only covers UI strings.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);
  private readonly dictionary = signal<Dictionary>({});

  readonly locale = signal<Locale>(environment.defaultLocale);
  readonly ready = computed(() => Object.keys(this.dictionary()).length > 0);

  async init(): Promise<void> {
    await this.load(this.readStoredLocale());
  }

  async setLocale(locale: Locale): Promise<void> {
    if (locale === this.locale()) return;
    await this.load(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale); // a UI preference only, not a credential
    } catch {
      /* storage unavailable: preference simply isn't remembered */
    }
  }

  /** Translate a key; params replace `{name}` placeholders. Falls back to the key itself. */
  t(key: string, params?: Record<string, string | number>): string {
    let text = this.dictionary()[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  private async load(locale: Locale): Promise<void> {
    const dict = await firstValueFrom(this.http.get<Dictionary>(`/i18n/${locale}.json`));
    this.dictionary.set(dict);
    this.locale.set(locale);
    document.documentElement.lang = locale;
  }

  private readStoredLocale(): Locale {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && (environment.supportedLocales as readonly string[]).includes(stored)) {
        return stored as Locale;
      }
    } catch {
      /* ignore */
    }
    return environment.defaultLocale;
  }
}
