import { extractApiCollection } from './appointment-api.util';
import { Patient } from './patient.model';

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

/** Normaliza filas del API Symfony (`GET /api/patients`, búsqueda, etc.). */
export function normalizePatientFromApi(row: unknown): Patient | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const o = row as Record<string, unknown>;
  const id = Number(o['id']);
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }

  return {
    id,
    identityDocument: pickString(o, ['identityDocument', 'identity_document']),
    firstName: pickString(o, ['firstName', 'first_name']),
    lastName: pickString(o, ['lastName', 'last_name']),
    ssNumber: (pickString(o, ['ssNumber', 'ss_number']) as string | undefined) ?? null,
    phone: pickString(o, ['phone']),
    email: pickString(o, ['email']),
    address: pickString(o, ['address']),
    consultationReason: pickString(o, ['consultationReason', 'consultation_reason']),
    familyHistory: pickString(o, ['familyHistory', 'family_history']),
    healthStatus: pickString(o, ['healthStatus', 'health_status']),
    lifestyleHabits: pickString(o, ['lifestyleHabits', 'lifestyle_habits']),
    medicationAllergies: pickString(o, ['medicationAllergies', 'medication_allergies']),
    allergiesBitmask:
      typeof o['allergiesBitmask'] === 'number' && Number.isFinite(o['allergiesBitmask'])
        ? (o['allergiesBitmask'] as number)
        : undefined,
    selectedAllergies: Array.isArray(o['selectedAllergies'])
      ? (o['selectedAllergies'] as unknown[])
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
      : undefined,
    profileImage:
      pickString(o, ['profileImage', 'profile_image', 'profile_image_url', 'profileImageUrl']) ?? null,
    registrationDate:
      pickString(o, ['registrationDate', 'registration_date']) ??
      (typeof o['registrationDate'] === 'string' ? o['registrationDate'] : undefined),
  };
}

export function normalizePatientsFromApi(body: unknown): Patient[] {
  return extractApiCollection(body)
    .map((row) => normalizePatientFromApi(row))
    .filter((p): p is Patient => p != null);
}
