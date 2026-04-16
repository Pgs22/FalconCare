/**
 * Comprobación rápida de que el backend Symfony responde en la misma base URL que el front.
 * Uso:
 *   node scripts/smoke-api.mjs
 *   FALCONCARE_API_BASE_URL=https://tu-api.example.com node scripts/smoke-api.mjs
 *
 * No sustituye pruebas E2E con login; solo confirma red + HTTP en rutas habituales.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveApiBaseUrl() {
  const fromEnv = process.env.FALCONCARE_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  try {
    const envPath = join(__dirname, '..', 'src', 'environments', 'environment.ts');
    const src = readFileSync(envPath, 'utf8');
    const m = src.match(/const\s+apiUrl\s*=\s*['"]([^'"]+)['"]/);
    if (m?.[1]) {
      return m[1].replace(/\/$/, '');
    }
  } catch {
    /* ignore */
  }
  return 'http://127.0.0.1:8000';
}

async function tryGet(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json, */*' },
    });
    return { ok: true, status: res.status, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, url, error: msg };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const base = resolveApiBaseUrl();
  const candidates = [
    `${base}/api/health`,
    `${base}/api`,
    `${base}/api/docs.json`,
  ];

  console.log(`[smoke-api] Base URL: ${base}\n`);

  const results = [];
  for (const url of candidates) {
    const r = await tryGet(url);
    results.push({ ...r, url });
    if (r.ok) {
      console.log(`  GET ${url} → HTTP ${r.status}`);
    } else {
      console.log(`  GET ${url} → fallo: ${r.error ?? 'unknown'}`);
    }
  }

  const anyHttp = results.some((r) => r.ok && r.status > 0);
  const reachable = results.some((r) => r.ok);

  if (!reachable) {
    console.error('\n[smoke-api] ERROR: No se pudo conectar al backend. ¿Está levantado Symfony en esa URL?');
    console.error('         Define FALCONCARE_API_BASE_URL si usas otro host/puerto.\n');
    process.exit(1);
  }

  if (anyHttp) {
    const codes = results.filter((r) => r.ok).map((r) => r.status);
    const has2xx = codes.some((c) => c >= 200 && c < 300);
    const has401 = codes.some((c) => c === 401);
    if (has2xx) {
      console.log('\n[smoke-api] OK: El backend respondió con éxito en al menos un endpoint.\n');
      process.exit(0);
    }
    if (has401) {
      console.log(
        '\n[smoke-api] AVISO: Respuesta 401 (API protegida). La conexión de red funciona; hace falta JWT para datos reales.\n'
      );
      process.exit(0);
    }
    console.warn(
      '\n[smoke-api] AVISO: El servidor respondió pero sin 2xx (revisa rutas / CORS / configuración API Platform).\n'
    );
    process.exit(0);
  }

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
