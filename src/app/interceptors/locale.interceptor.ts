import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { LanguageService } from '../services/language.service';

/**
 * Envía el idioma activo a Symfony (`ApiLocaleSubscriber` lee `Accept-Language` o `?locale=`).
 * Misma heurística que `authInterceptor` (`/api/` en la URL) para cubrir URL absoluta o relativa.
 *
 * Contrato cruzado (repo backend hermano **FalconCareSymfony**):
 * - `src/EventSubscriber/ApiLocaleSubscriber.php`
 * - Traducciones dominio `api`: `translations/api.{ca,es,en,fr}.yaml`
 * - Test de integración: `tests/Controller/Api/ApiAcceptLanguageTest.php`
 */
export const localeInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  const lang = inject(LanguageService).current();

  return next(
    req.clone({
      setHeaders: {
        'Accept-Language': lang,
      },
    })
  );
};
