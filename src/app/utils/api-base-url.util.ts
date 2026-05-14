/**
 * Normaliza la URL base de la API (sin barra final, sin espacios).
 */
export function normalizeApiBaseUrl(url: string | undefined | null): string {
  if (url == null || typeof url !== 'string') {
    return '';
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}
