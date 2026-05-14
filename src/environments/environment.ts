/**
 * Base de la API Symfony (`DocumentApiController`, `PatientApiController`).
 * Debe coincidir con `API_BASE_URL` del `.env` (mismo host/puerto que las IRI `patient` en POST).
 * El `DocumentService` normaliza barra final al construir URLs.
 */
const apiUrl = 'http://127.0.0.1:8000';

export const environment = {
  production: false,
  /** URL base del API (recomendada en el código existente). */
  apiBaseUrl: apiUrl,
  /** Alias útil para documentación / nuevos servicios (`apiBaseUrl` y `apiUrl` son idénticos). */
  apiUrl,
} as const;
