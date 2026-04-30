# Documents Runtime Checklist (E2E/API)

Checklist operativo para certificar flujo real con autenticación y datos Neon en runtime.

## 1) API automatizable (recomendado en CI)

Script: `scripts/documents-runtime-check.mjs`

### Cobertura

- Login real: `POST /api/auth/login`
- Pacientes reales: `GET /api/patients`
- Consistencia de listados: `GET /api/documents` con:
  - `patientId`
  - `patient.id`
  - `patient` (IRI)
- Upload: `POST /api/documents` (`multipart/form-data`)
- Lectura:
  - Lista por paciente
  - Detalle por id (`GET /api/documents/{id}?patientId=...`)
- Preview backend:
  - Descarga binaria (`GET /api/documents/{id}/download?patientId=...`)
- Nota clínica:
  - `PUT /api/documents/{id}?patientId=...` (campo `description`)
  - Relectura de verificación
- Borrado:
  - `DELETE /api/documents/{patientId}/{documentId}`
  - Relectura de verificación

### Variables de entorno

- `FALCONCARE_E2E_EMAIL` (obligatoria)
- `FALCONCARE_E2E_PASSWORD` (obligatoria)
- `FALCONCARE_API_BASE_URL` (opcional; por defecto usa `environment.ts`)
- `FALCONCARE_E2E_PATIENT_ID` (opcional)

### Ejecución

```bash
FALCONCARE_E2E_EMAIL="doctor@falconcare.com" \
FALCONCARE_E2E_PASSWORD="tu-password" \
npm run api:documents:runtime
```

## 2) E2E funcional manual (multi-vista en tiempo real)

> Objetivo: validar consistencia visible entre `documents`, `patient-panel`, `agenda` en el navegador.

- Abrir dos pestañas autenticadas con usuario clínico.
- Pestaña A: `documents` en paciente X.
- Pestaña B: `patient-panel` o `agenda` del mismo paciente.

### Flujo

- Subir documento en A.
  - Esperado: aparece en A y en B tras refresco realtime.
- Editar nota clínica del documento en A.
  - Esperado: descripción actualizada persistida (verificable al reabrir en B).
- Borrar documento en A.
  - Esperado: desaparece en A y B sin inconsistencias.
- Modificar paciente (nombre/datos) desde panel de edición.
  - Esperado: actualización en `documents` y `agenda` tras sync realtime.
- Crear o eliminar paciente desde flujo operativo permitido.
  - Esperado: listado de pacientes en `documents` se actualiza sin duplicados ni “fantasmas”.

### Criterios de aceptación

- Sin errores 4xx/5xx inesperados en consola/red durante el flujo.
- Sin desalineación entre vistas para el mismo paciente/documento.
- Sin registros huérfanos (documento visible tras borrado).
- Sin redundancias en lista (ids duplicados).
