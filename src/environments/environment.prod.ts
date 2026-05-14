/**
 * Producción: misma URL pública que `API_BASE_URL` en Symfony.
 * El `DocumentService` quita barras finales al resolver IRI de `patient` en POST.
 */
const apiUrl = 'https://api.tu-dominio.com';

export const environment = {
  production: true,
  apiBaseUrl: apiUrl,
  apiUrl,
} as const;
