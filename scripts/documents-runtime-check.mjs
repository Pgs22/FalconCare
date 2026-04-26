/**
 * Certificación API runtime para Documents con autenticación real.
 *
 * Cubre:
 * - Login JWT
 * - Pacientes reales (GET /api/patients)
 * - Consistencia de listado documentos (patientId / patient.id / patient IRI)
 * - Upload multipart
 * - Lectura y descarga (preview backend)
 * - Guardado de nota clínica (PUT description)
 * - Borrado y verificación de eliminación
 *
 * Variables:
 * - FALCONCARE_API_BASE_URL (opcional; por defecto lee environment.ts o usa http://127.0.0.1:8000)
 * - FALCONCARE_E2E_EMAIL (obligatoria)
 * - FALCONCARE_E2E_PASSWORD (obligatoria)
 * - FALCONCARE_E2E_PATIENT_ID (opcional; si no, usa el primer paciente disponible)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function log(step, message) {
  console.log(`[documents-runtime] [${step}] ${message}`);
}

function fail(message) {
  throw new Error(message);
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
    // ignore
  }
  return 'http://127.0.0.1:8000';
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

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const p = payload;
    if (Array.isArray(p['hydra:member'])) return p['hydra:member'];
    if (Array.isArray(p.member)) return p.member;
    if (Array.isArray(p.items)) return p.items;
    if (Array.isArray(p.data)) return p.data;
  }
  return [];
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDocumentId(doc) {
  return toNumberOrNull(doc?.id);
}

function hasDocumentId(collection, id) {
  return collection.some((d) => getDocumentId(d) === id);
}

async function main() {
  const base = resolveApiBaseUrl();
  const email = process.env.FALCONCARE_E2E_EMAIL?.trim();
  const password = process.env.FALCONCARE_E2E_PASSWORD?.trim();
  const preferredPatientId = toNumberOrNull(process.env.FALCONCARE_E2E_PATIENT_ID);

  if (!email || !password) {
    fail(
      'Faltan credenciales. Define FALCONCARE_E2E_EMAIL y FALCONCARE_E2E_PASSWORD para ejecutar la batería.'
    );
  }

  log('setup', `API base URL: ${base}`);

  // 1) Login
  const loginUrl = `${base}/api/auth/login`;
  const { res: loginRes, body: loginBody } = await httpJson(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    fail(`Login falló (${loginRes.status}). Respuesta: ${JSON.stringify(loginBody)}`);
  }
  const token = loginBody?.accessToken ?? loginBody?.access_token;
  if (!token || typeof token !== 'string') {
    fail('Login OK pero sin token JWT en accessToken/access_token.');
  }
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  log('auth', 'JWT obtenido correctamente.');

  // 2) Pacientes reales
  const patientsUrl = `${base}/api/patients`;
  const { res: patientsRes, body: patientsBody } = await httpJson(patientsUrl, {
    method: 'GET',
    headers: authHeaders,
  });
  if (!patientsRes.ok) {
    fail(`GET /api/patients falló (${patientsRes.status}).`);
  }
  const patients = extractCollection(patientsBody);
  if (patients.length === 0) {
    fail('No hay pacientes en BD para ejecutar la prueba runtime.');
  }
  let patientId = preferredPatientId;
  if (!patientId) {
    patientId = toNumberOrNull(patients[0]?.id);
  }
  if (!patientId) {
    fail('No se pudo resolver patientId válido.');
  }
  log('patients', `Paciente de prueba: #${patientId}. Total pacientes visibles: ${patients.length}.`);

  // 3) Consistencia de listado documentos (3 filtros soportados)
  const listByPatientIdUrl = `${base}/api/documents?patientId=${patientId}`;
  const listByPatientDotIdUrl = `${base}/api/documents?patient.id=${patientId}`;
  const patientIri = `${base}/api/patients/${patientId}`;
  const listByPatientIriUrl = `${base}/api/documents?patient=${encodeURIComponent(patientIri)}`;

  const [l1, l2, l3] = await Promise.all([
    httpJson(listByPatientIdUrl, { method: 'GET', headers: authHeaders }),
    httpJson(listByPatientDotIdUrl, { method: 'GET', headers: authHeaders }),
    httpJson(listByPatientIriUrl, { method: 'GET', headers: authHeaders }),
  ]);
  if (!l1.res.ok || !l2.res.ok || !l3.res.ok) {
    fail(
      `Fallo en listados de documentos (${l1.res.status}, ${l2.res.status}, ${l3.res.status}).`
    );
  }
  const docsById = extractCollection(l1.body);
  const docsByDot = extractCollection(l2.body);
  const docsByIri = extractCollection(l3.body);
  log(
    'consistency',
    `Listados OK. Conteos patientId=${docsById.length}, patient.id=${docsByDot.length}, patientIRI=${docsByIri.length}.`
  );

  // 4) Upload
  const uniqueTag = `runtime-${Date.now()}`;
  const uploadedFileName = `${uniqueTag}.txt`;
  const uploadBody = new FormData();
  uploadBody.append('file', new Blob([`FalconCare documents runtime ${uniqueTag}`], { type: 'text/plain' }), uploadedFileName);
  uploadBody.append('patient', patientIri);
  uploadBody.append('type', 'text/plain');
  uploadBody.append('description', `Runtime check ${uniqueTag}`);

  const uploadUrl = `${base}/api/documents`;
  const { res: uploadRes, body: uploadDoc } = await httpJson(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: uploadBody,
  });
  if (!uploadRes.ok) {
    fail(`Upload falló (${uploadRes.status}). ${JSON.stringify(uploadDoc)}`);
  }
  const documentId = getDocumentId(uploadDoc);
  if (!documentId) {
    fail(`Upload OK pero sin id de documento. Payload: ${JSON.stringify(uploadDoc)}`);
  }
  log('upload', `Documento creado: #${documentId} (${uploadedFileName}).`);

  try {
    // 5) Lectura por lista y por detalle
    const { res: listAfterRes, body: listAfterBody } = await httpJson(listByPatientIdUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!listAfterRes.ok) {
      fail(`Lectura de lista post-upload falló (${listAfterRes.status}).`);
    }
    const listAfter = extractCollection(listAfterBody);
    if (!hasDocumentId(listAfter, documentId)) {
      fail(`El documento #${documentId} no aparece en /api/documents?patientId=${patientId}.`);
    }

    const getByIdUrl = `${base}/api/documents/${documentId}?patientId=${patientId}`;
    const { res: getRes, body: getBody } = await httpJson(getByIdUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!getRes.ok) {
      fail(`GET documento por id falló (${getRes.status}).`);
    }
    if (getDocumentId(getBody) !== documentId) {
      fail(`GET por id devolvió documento inesperado: ${JSON.stringify(getBody)}`);
    }
    log('read', `Documento #${documentId} visible por lista y detalle.`);

    // 6) Preview backend (download)
    const downloadUrl = `${base}/api/documents/${documentId}/download?patientId=${patientId}`;
    const downloadRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!downloadRes.ok) {
      fail(`Download falló (${downloadRes.status}) para #${documentId}.`);
    }
    const downloadText = await downloadRes.text();
    if (!downloadText.includes(uniqueTag)) {
      fail(`Download OK pero contenido inesperado para #${documentId}.`);
    }
    log('preview', 'Descarga/preview backend validado.');

    // 7) Nota clínica (PUT description)
    const noteLine = `Nota runtime ${new Date().toISOString()}`;
    const nextDescription = `${String(getBody?.description ?? '').trim()}\n${noteLine}`.trim();
    const putUrl = `${base}/api/documents/${documentId}?patientId=${patientId}`;
    const { res: putRes } = await httpJson(putUrl, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: nextDescription }),
    });
    if (!putRes.ok) {
      fail(`PUT nota clínica falló (${putRes.status}).`);
    }
    const { res: verifyRes, body: verifyBody } = await httpJson(getByIdUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!verifyRes.ok || !String(verifyBody?.description ?? '').includes(noteLine)) {
      fail(`No se pudo verificar persistencia de nota clínica en #${documentId}.`);
    }
    log('note', 'Nota clínica guardada y verificada.');
  } finally {
    // 8) Borrado + verificación
    const deleteUrl = `${base}/api/documents/${patientId}/${documentId}`;
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: authHeaders,
    });
    if (!deleteRes.ok) {
      fail(`DELETE documento #${documentId} falló (${deleteRes.status}).`);
    }
    const { res: listAfterDeleteRes, body: listAfterDeleteBody } = await httpJson(listByPatientIdUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!listAfterDeleteRes.ok) {
      fail(`Verificación post-delete falló (${listAfterDeleteRes.status}).`);
    }
    const listAfterDelete = extractCollection(listAfterDeleteBody);
    if (hasDocumentId(listAfterDelete, documentId)) {
      fail(`El documento #${documentId} sigue apareciendo tras DELETE.`);
    }
    log('delete', `Documento #${documentId} eliminado y no visible en listado.`);
  }

  log('done', 'Batería API runtime completada correctamente.');
}

main().catch((e) => {
  console.error(`\n[documents-runtime] ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
