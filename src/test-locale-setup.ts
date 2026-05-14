/**
 * Registro global de locales para Karma / TestBed (antes de cualquier spec).
 * Debe coincidir con `main.ts` y con los idiomas de `LanguageService`.
 */
import { registerLocaleData } from '@angular/common';
import localeCa from '@angular/common/locales/ca';
import localeEs from '@angular/common/locales/es';
import localeEnGb from '@angular/common/locales/en-GB';
import localeFr from '@angular/common/locales/fr';

registerLocaleData(localeCa);
registerLocaleData(localeEs);
registerLocaleData(localeEnGb);
registerLocaleData(localeFr);
