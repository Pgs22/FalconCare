/**
 * Producción: misma URL pública que `API_BASE_URL` en el backend (sin barra final).
 * Configurar CORS en Symfony (`CORS_ALLOW_ORIGIN`, nelmio, etc.).
 */
const apiUrl = 'https://api.tu-dominio.com';

export const environment = {
  production: true,
  apiBaseUrl: apiUrl,
  apiUrl,
  syncEventsUrl: `${apiUrl}/api/events/sync`,
} as const;
