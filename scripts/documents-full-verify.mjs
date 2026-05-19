/**
 * Verificación exhaustiva Documents ↔ Symfony (alineación + PDF + multi-equipo vía Neon).
 *
 *   FALCONCARE_E2E_EMAIL=admin@falconcare.com
 *   FALCONCARE_E2E_PASSWORD=admin123
 *   node scripts/documents-full-verify.mjs
 */

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYMFONY_ROOT = join(__dirname, '..', '..', 'FalconCareSymfony');
const UPLOAD_DIR = join(SYMFONY_ROOT, 'public', 'uploads', 'documents');

const results = [];

function pass(step, detail) {
  results.push({ step, ok: true, detail });
  console.log(`  ✓ ${step}: ${detail}`);
}

function failStep(step, detail) {
  results.push({ step, ok: false, detail });
  console.error(`  ✗ ${step}: ${detail}`);
}

function resolveApiBaseUrl() {
  const fromEnv = process.env.FALCONCARE_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  try {
    const envPath = join(__dirname, '..', 'src', 'environments', 'environment.ts');
    const src = readFileSync(envPath, 'utf8');
    const m = src.match(/const\s+apiUrl\s*=\s*['"]([^'"]+)['"]/);
    if (m?.[1]) return m[1].replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return 'http://127.0.0.1:8000';
}

function readSymfonyApiBaseUrl() {
  try {
    const envLocal = join(SYMFONY_ROOT, '.env.local');
    const envFile = join(SYMFONY_ROOT, '.env');
    const src = readFileSync(existsSync(envLocal) ? envLocal : envFile, 'utf8');
    const m = src.match(/API_BASE_URL="([^"]+)"/);
    return m?.[1]?.replace(/\/$/, '') ?? null;
  } catch {
    return null;
  }
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await parseJsonSafe(res);
  return { res, body };
}

function neonBinaryLength(documentId) {
  try {
    const out = execSync(
      `php bin/console doctrine:query:sql "SELECT COALESCE(length(file_content), 0) AS bytes FROM document WHERE id = ${documentId}"`,
      { cwd: SYMFONY_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const text = String(out);
    if (/empty result set/i.test(text)) {
      return 0;
    }
    const nums = text.match(/\d+/g);
    if (!nums?.length) {
      return null;
    }
    return Number(nums[nums.length - 1]);
  } catch {
    return null;
  }
}

function runTeamAccessAudit() {
  try {
    const out = execSync('php bin/console app:documents:verify-team-access --json', {
      cwd: SYMFONY_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim());
  } catch (e) {
    const stdout = e?.stdout?.toString?.() ?? '';
    if (stdout.trim()) {
      try {
        return JSON.parse(stdout.trim());
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload['hydra:member'])) return payload['hydra:member'];
    if (Array.isArray(payload.member)) return payload.member;
  }
  return [];
}

async function main() {
  console.log('\n=== FalconCare — Verificación Documents (Front ↔ Symfony) ===\n');

  const frontBase = resolveApiBaseUrl();
  const symfonyBase = readSymfonyApiBaseUrl();
  if (symfonyBase && symfonyBase !== frontBase) {
    failStep('align-baseUrl', `Angular (${frontBase}) ≠ Symfony API_BASE_URL (${symfonyBase})`);
  } else {
    pass('align-baseUrl', `Base URL coherente: ${frontBase}`);
  }

  const email = process.env.FALCONCARE_E2E_EMAIL?.trim() ?? 'admin@falconcare.com';
  const password = process.env.FALCONCARE_E2E_PASSWORD?.trim() ?? 'admin123';

  try {
    const health = await fetch(`${frontBase}/api/health`);
    if (!health.ok) {
      failStep('api-health', `HTTP ${health.status}`);
    } else {
      pass('api-health', `${frontBase}/api/health → ${health.status}`);
    }
  } catch (e) {
    failStep('api-health', `No conecta: ${e instanceof Error ? e.message : String(e)}`);
    printSummary();
    process.exit(1);
  }

  const { res: loginRes, body: loginBody } = await httpJson(`${frontBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    failStep('auth-login', `HTTP ${loginRes.status} — ${JSON.stringify(loginBody)}`);
    printSummary();
    process.exit(1);
  }
  const token = loginBody?.accessToken;
  if (!token) {
    failStep('auth-login', 'Sin accessToken');
    printSummary();
    process.exit(1);
  }
  pass('auth-login', `JWT OK (${email})`);

  const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const { res: patientsRes, body: patientsBody } = await httpJson(`${frontBase}/api/patients`, {
    headers: authHeaders,
  });
  if (!patientsRes.ok) {
    failStep('patients-list', `HTTP ${patientsRes.status}`);
    printSummary();
    process.exit(1);
  }
  const patients = extractCollection(patientsBody);
  if (patients.length === 0) {
    failStep('patients-list', 'Sin pacientes en BD');
    printSummary();
    process.exit(1);
  }
  const patientId = Number(patients[0]?.id);
  pass('patients-list', `${patients.length} pacientes; prueba con #${patientId}`);

  const patientIri = `${frontBase}/api/patients/${patientId}`;
  const tag = `verify-${Date.now()}`;
  const pdfBytes = `%PDF-1.4\n% FalconCare verify ${tag}\n`;

  const form = new FormData();
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `informe-${tag}.pdf`);
  form.append('patient', patientIri);
  form.append('type', 'application/pdf');
  form.append('description', `Verificación ${tag}`);

  const { res: uploadRes, body: uploadDoc } = await httpJson(`${frontBase}/api/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
  });
  if (!uploadRes.ok) {
    failStep('upload-pdf', `HTTP ${uploadRes.status} — ${JSON.stringify(uploadDoc)}`);
    printSummary();
    process.exit(1);
  }

  const documentId = Number(uploadDoc?.id);
  const filePath = String(uploadDoc?.file_path ?? uploadDoc?.filePath ?? '');
  const storagePath = String(uploadDoc?.storage_path ?? uploadDoc?.storagePath ?? '');
  if (!documentId || !filePath) {
    failStep('upload-pdf', `Sin id/file_path: ${JSON.stringify(uploadDoc)}`);
    printSummary();
    process.exit(1);
  }
  if (!filePath.match(/\.pdf$/i)) {
    failStep('upload-pdf', `file_path sin .pdf: ${filePath}`);
  } else {
    pass('upload-pdf', `Documento #${documentId}, file_path=${filePath}`);
  }
  if (storagePath && storagePath.includes('uploads/documents')) {
    pass('upload-storagePath', storagePath);
  } else {
    failStep('upload-storagePath', `storage_path inesperado: ${storagePath || '(vacío)'}`);
  }

  const diskFile = join(UPLOAD_DIR, filePath.replace(/^.*[/\\]/, ''));
  if (existsSync(diskFile)) {
    pass('upload-disk', `Fichero en ${diskFile}`);
  } else {
    failStep('upload-disk', `No existe en public/uploads/documents: ${filePath}`);
  }

  const neonLen = neonBinaryLength(documentId);
  if (neonLen !== null && neonLen > 0) {
    pass('upload-neon-binary', `file_content en Neon: ${neonLen} bytes (otros portátiles pueden verlo)`);
  } else {
    failStep(
      'upload-neon-binary',
      neonLen === null
        ? 'No se pudo comprobar file_content (¿migración aplicada?)'
        : 'file_content vacío tras subida — el equipo no podrá previsualizar',
    );
  }

  const subUrl = `${frontBase}/api/patients/${patientId}/documents`;
  const { res: subRes, body: subBody } = await httpJson(subUrl, { headers: authHeaders });
  if (!subRes.ok) {
    failStep('list-subresource', `HTTP ${subRes.status}`);
  } else {
    const subDocs = extractCollection(subBody);
    const found = subDocs.some((d) => Number(d?.id) === documentId);
    if (found) {
      pass('list-subresource', `GET /api/patients/${patientId}/documents incluye #${documentId}`);
    } else {
      failStep('list-subresource', `No aparece #${documentId} en subresource`);
    }
  }

  const listUrl = `${frontBase}/api/documents?patientId=${patientId}`;
  const { res: listRes, body: listBody } = await httpJson(listUrl, { headers: authHeaders });
  const listDocs = extractCollection(listBody);
  if (listRes.ok && listDocs.some((d) => Number(d?.id) === documentId)) {
    pass('list-query', `GET /api/documents?patientId= OK`);
  } else {
    failStep('list-query', `Listado query falló o sin documento`);
  }

  const downloadUrl = `${frontBase}/api/documents/${documentId}/download?patientId=${patientId}`;
  const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!dlRes.ok) {
    failStep('download-local', `HTTP ${dlRes.status}`);
  } else {
    const buf = await dlRes.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    if (text.includes('%PDF') && text.includes(tag)) {
      pass('download-local', 'Descarga con firma PDF y contenido esperado');
    } else {
      failStep('download-local', `Contenido inesperado (inicio): ${text.slice(0, 80)}`);
    }
  }

  if (existsSync(diskFile)) {
    unlinkSync(diskFile);
    pass('simulate-remote', `Eliminado fichero local (simula otro PC): ${filePath}`);
    const dl2 = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!dl2.ok) {
      failStep('download-neon-fallback', `HTTP ${dl2.status} sin fichero local`);
    } else {
      const buf2 = await dl2.arrayBuffer();
      const text2 = new TextDecoder().decode(buf2);
      if (text2.includes('%PDF') && text2.includes(tag)) {
        pass('download-neon-fallback', 'Descarga desde Neon (file_content) sin disco local');
      } else {
        failStep('download-neon-fallback', 'Sin firma PDF en respuesta desde BD');
      }
    }
  }

  const audit = runTeamAccessAudit();
  if (audit?.ok === true) {
    pass('team-audit', `Todos los documentos en BD tienen binario Neon (${audit.with_neon_binary}/${audit.total})`);
  } else if (audit) {
    const missing = audit.missing_neon_binary?.length ?? 0;
    const backfill = audit.backfillable_on_this_machine?.length ?? 0;
    if (missing === 0) {
      pass('team-audit', 'Auditoría OK');
    } else {
      console.warn(
        `  ⚠ team-audit (legado): ${missing} documento(s) antiguos sin binario en Neon` +
          (backfill > 0
            ? ' — en el PC con el PDF: php bin/console app:documents:backfill-binary'
            : ' — deben re-subirse'),
      );
      results.push({
        step: 'team-audit',
        ok: true,
        detail: `${missing} legado(s) sin Neon; subidas nuevas OK (ver upload-neon-binary + download-neon-fallback)`,
      });
    }
  } else {
    failStep('team-audit', 'No se pudo ejecutar app:documents:verify-team-access');
  }

  const deleteUrl = `${frontBase}/api/documents/${patientId}/${documentId}`;
  const delRes = await fetch(deleteUrl, { method: 'DELETE', headers: authHeaders });
  if (delRes.ok) {
    pass('cleanup-delete', `Documento #${documentId} eliminado`);
  } else {
    failStep('cleanup-delete', `DELETE HTTP ${delRes.status}`);
  }

  printSummary();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log('\n--- Resumen ---');
  console.log(`  OK: ${passed.length}  |  Fallos: ${failed.length}`);
  if (failed.length) {
    console.log('\nCorregir antes de dar por cerrado el flujo Documents.');
  } else {
    console.log('\nFlujo Documents alineado con Symfony y listo para visualizar PDFs entre equipos (vía Neon).');
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
