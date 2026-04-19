# Documentacion Patient

Esta documentacion refleja el contrato real del backend Symfony para Patient y el comportamiento que el frontend Angular debe mantener.

## 1) Estado del backend

El backend mantiene un unico controlador para Patient:

- `src/Controller/Api/PatientApiController.php`

Se elimino el controlador legacy:

- `src/Controller/PatientController.php`

La operativa de paciente sigue disponible via `/api/patients`.

## 2) Endpoints vigentes

- `GET /api/patients`
- `GET /api/patients/{id}`
- `GET /api/patients/by-identity/{identityDocument}`
- `POST /api/patients`
- `PUT /api/patients/{id}`
- `PATCH /api/patients/{id}`
- `DELETE /api/patients/{id}`
- `GET /api/patients/{id}/documents`

Nota: actualmente no existe `POST /api/patients/new` en backend.

## 3) Contrato Patient: alergias por bitmask

Ademas del campo historico de texto `medicationAllergies`, existe el campo numerico `allergiesBitmask`.

Entidad:

- Columna DB: `patient.allergies_bitmask` (INT, default 0)
- Propiedad API: `allergiesBitmask`
- Propiedad API alternativa por lista: `selectedAllergies`

### 3.1 Flags disponibles

- `1` -> `ALLERGY_PENICILLIN`
- `2` -> `ALLERGY_LATEX`
- `4` -> `ALLERGY_ANESTHESIA`
- `8` -> `ALLERGY_NSAIDS`

Ejemplo:

- Penicilina (`1`) + Anestesia (`4`) => bitmask `5`

Formula:

- `bitmask = flag1 | flag2 | ...`

### 3.2 Request Patient (POST/PUT/PATCH)

Campos de alergias aceptados:

- `medicationAllergies`
- `medication_allergies`
- `allergiesBitmask`
- `selectedAllergies`

Reglas:

- Si envias `medicationAllergies` y `medication_allergies`, deben tener el mismo valor.
- Si envias `selectedAllergies`, backend calcula `allergiesBitmask` automaticamente.

Ejemplo:

```json
{
  "identityDocument": "12345678A",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "phone": "600000000",
  "email": "ada@example.com",
  "address": "Street 1",
  "consultationReason": "Revision",
  "familyHistory": "None",
  "healthStatus": "Good",
  "lifestyleHabits": "Healthy",
  "medicationAllergies": "PENICILLIN, LATEX",
  "medication_allergies": "PENICILLIN, LATEX",
  "allergiesBitmask": 3,
  "selectedAllergies": [1, 2]
}
```

### 3.3 Response Patient

En respuestas de paciente pueden venir:

- `medicationAllergies`
- `medication_allergies`
- `allergiesBitmask`
- `selectedAllergies`

Compatibilidad de profile image:

- `profile_image`
- `profile_image_url`
- `profileImage`
- `profileImageUrl`

## 4) Instrucciones Angular

### 4.1 Modelo

El modelo debe incluir:

- `allergiesBitmask?: number`
- `selectedAllergies?: number[]`

### 4.2 Escritura (`toApiPatientBody`)

Al construir payload para create/update:

1. Mantener `medicationAllergies` y `medication_allergies`.
2. Enviar tambien `allergiesBitmask` y `selectedAllergies`.

Recomendacion:

- Si la UI usa checkboxes, generar `selectedAllergies` y `allergiesBitmask` en el front.
- Si la UI solo guarda entero, enviar al menos `allergiesBitmask`.

### 4.3 Lectura (`adaptPatient`)

Prioridad recomendada:

1. Si existe `selectedAllergies`, usarla como fuente principal.
2. Si no existe pero hay `allergiesBitmask`, derivar la lista localmente.
3. Mantener `medicationAllergies` para pantallas legacy.

### 4.4 Helpers TypeScript sugeridos

```ts
export const AllergyFlag = {
  PENICILLIN: 1,
  LATEX: 2,
  ANESTHESIA: 4,
  NSAIDS: 8,
} as const;

export function buildAllergiesBitmask(selected: number[]): number {
  return selected.reduce((mask, flag) => mask | flag, 0);
}

export function selectedAllergiesFromBitmask(mask: number): number[] {
  const all = [
    AllergyFlag.PENICILLIN,
    AllergyFlag.LATEX,
    AllergyFlag.ANESTHESIA,
    AllergyFlag.NSAIDS,
  ];
  return all.filter((flag) => (mask & flag) === flag);
}
```

## 5) Fuentes en el frontend

- `src/app/models/patient.model.ts`
- `src/app/services/patient.service.ts`
- `src/app/pages/patient-register/patient-register.ts`
- `src/app/pages/patient-register/patient-register.html`
- `src/app/pages/patient-panel/patient-panel.ts`

## 6) Checklist rapido

1. Usar solo rutas `/api/patients`.
2. Mantener compatibilidad con `medicationAllergies`.
3. Anadir soporte a `allergiesBitmask` y `selectedAllergies` en create/update/read.
4. Si existe codigo que llama `/api/patients/new`, migrarlo a `POST /api/patients`.