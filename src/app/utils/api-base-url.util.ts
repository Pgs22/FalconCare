/**
 * Base pública del API (misma que `API_BASE_URL` en Symfony).
 * Evita barras finales duplicadas en rutas e IRI (`/api//documents`, etc.).
 */
export function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
