/**
 * Base de la API Symfony (sin barra final). Debe coincidir con `API_BASE_URL` del backend
 * (mismo host/puerto que las IRI que devuelve el servidor, p. ej. `http://127.0.0.1:8000`).
 */
const apiUrl = 'http://127.0.0.1:8000';

export const environment = {
  production: false,
  /** URL base del API (recomendada en el código existente). */
  apiBaseUrl: apiUrl,
  /** Alias útil para documentación / nuevos servicios (`apiBaseUrl` y `apiUrl` son idénticos). */
  apiUrl,
} as const;
