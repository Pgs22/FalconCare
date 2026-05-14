/** Clave compartida con `LanguageService` y `LOCALE_ID` (misma fuente que el backend espera vía Accept-Language). */
export const FALCONCARE_LANG_STORAGE_KEY = 'falconcare_lang';

export type FalconcareUiLanguage = 'es' | 'ca' | 'en' | 'fr';

export const FALCONCARE_SUPPORTED_LANGS: readonly FalconcareUiLanguage[] = ['es', 'ca', 'en', 'fr'];

export const FALCONCARE_FALLBACK_LANG: FalconcareUiLanguage = 'es';

export function normalizeFalconcareLang(input: string | null | undefined): FalconcareUiLanguage {
  if (input == null || input === '') {
    return FALCONCARE_FALLBACK_LANG;
  }
  const base = input.toLowerCase().split('-')[0] as FalconcareUiLanguage;
  return FALCONCARE_SUPPORTED_LANGS.includes(base) ? base : FALCONCARE_FALLBACK_LANG;
}

/** Idioma inicial antes de instanciar servicios (localStorage + navegador, coherente con `LanguageService`). */
export function readInitialFalconcareLang(): FalconcareUiLanguage {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(FALCONCARE_LANG_STORAGE_KEY);
    if (saved) {
      return normalizeFalconcareLang(saved);
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeFalconcareLang(navigator.language);
  }
  return FALCONCARE_FALLBACK_LANG;
}
