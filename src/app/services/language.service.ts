import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  FALCONCARE_FALLBACK_LANG,
  FALCONCARE_LANG_STORAGE_KEY,
  FALCONCARE_SUPPORTED_LANGS,
  normalizeFalconcareLang,
  readInitialFalconcareLang,
  type FalconcareUiLanguage,
} from '../constants/falconcare-lang';

export type SupportedLanguage = FalconcareUiLanguage;

/**
 * Idioma activo de la UI (ngx-translate). El interceptor HTTP `localeInterceptor` envía
 * el mismo código en `Accept-Language` hacia Symfony (`ApiLocaleSubscriber`).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly supportedLanguages = FALCONCARE_SUPPORTED_LANGS;
  readonly fallbackLanguage = FALCONCARE_FALLBACK_LANG;

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs([...this.supportedLanguages]);
    this.translate.setDefaultLang(this.fallbackLanguage);
  }

  init(): SupportedLanguage {
    const resolved = readInitialFalconcareLang();
    this.use(resolved);
    return resolved;
  }

  use(language: SupportedLanguage): void {
    this.translate.use(language);
    localStorage.setItem(FALCONCARE_LANG_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }

  current(): SupportedLanguage {
    const current = this.translate.currentLang || this.translate.getDefaultLang() || this.fallbackLanguage;
    return normalizeFalconcareLang(current);
  }
}
