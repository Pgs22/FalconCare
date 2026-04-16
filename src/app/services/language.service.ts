import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type SupportedLanguage = 'es' | 'ca' | 'en' | 'fr';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private static readonly storageKey = 'falconcare_lang';
  readonly supportedLanguages: readonly SupportedLanguage[] = ['es', 'ca', 'en', 'fr'];
  readonly fallbackLanguage: SupportedLanguage = 'es';

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs([...this.supportedLanguages]);
    this.translate.setDefaultLang(this.fallbackLanguage);
  }

  init(): SupportedLanguage {
    const resolved = this.resolveInitialLanguage();
    this.use(resolved);
    return resolved;
  }

  use(language: SupportedLanguage): void {
    this.translate.use(language);
    localStorage.setItem(LanguageService.storageKey, language);
    document.documentElement.lang = language;
  }

  current(): SupportedLanguage {
    const current = this.translate.currentLang || this.translate.getDefaultLang() || this.fallbackLanguage;
    return this.normalizeLanguage(current);
  }

  private resolveInitialLanguage(): SupportedLanguage {
    const saved = localStorage.getItem(LanguageService.storageKey);
    if (saved) {
      return this.normalizeLanguage(saved);
    }
    return this.normalizeLanguage(navigator.language);
  }

  private normalizeLanguage(input: string): SupportedLanguage {
    const base = input.toLowerCase().split('-')[0] as SupportedLanguage;
    return this.supportedLanguages.includes(base) ? base : this.fallbackLanguage;
  }
}
