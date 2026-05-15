import { environment } from '../../environments/environment';

const KNOWN_API_ORIGINS = [
  'http://127.0.0.1:8000',
  'http://localhost:8000',
  environment.apiBaseUrl,
].filter((origin, index, list) => origin && list.indexOf(origin) === index);

/**
 * Convierte una IRI absoluta del backend (`http://127.0.0.1:8000/api/...`) en ruta relativa
 * para que `ng serve` la reenvíe vía `proxy.conf.json` (mismo origen que el front).
 */
export function toProxiedApiPath(urlOrPath: string): string {
  const value = urlOrPath?.trim();
  if (!value) {
    return value;
  }
  if (value.startsWith('/api/')) {
    return value;
  }
  for (const origin of KNOWN_API_ORIGINS) {
    const base = origin.replace(/\/$/, '');
    if (value.startsWith(`${base}/api/`)) {
      return value.slice(base.length);
    }
  }
  return value;
}
