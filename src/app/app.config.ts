import {
  APP_INITIALIZER,
  ApplicationConfig,
  LOCALE_ID,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { readInitialFalconcareLang } from './constants/falconcare-lang';
import { authInterceptor } from './interceptors/auth.interceptor';
import { localeInterceptor } from './interceptors/locale.interceptor';
import { LanguageService } from './services/language.service';

function initApplicationLanguage(languageService: LanguageService): () => void {
  return () => {
    languageService.init();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: initApplicationLanguage,
      deps: [LanguageService],
    },
    {
      provide: LOCALE_ID,
      useFactory: (): string => readInitialFalconcareLang(),
    },
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([localeInterceptor, authInterceptor])),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
      })
    ),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'es',
      })
    ),
    ...provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json',
    }),
  ]
};
