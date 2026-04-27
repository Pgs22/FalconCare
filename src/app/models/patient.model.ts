export interface Patient {
  id: number;
  // El backend real puede tener más campos; se amplía cuando confirmemos el contrato.
  // Campos que coinciden con el esquema de Neon (contrato aproximado).
  identityDocument?: string;
  firstName?: string;
  lastName?: string;
  ssNumber?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  consultationReason?: string;
  familyHistory?: string;
  healthStatus?: string;
  lifestyleHabits?: string;
  medicationAllergies?: string;
  allergiesBitmask?: number;
  selectedAllergies?: number[];
  profileImage?: string | null;
  registrationDate?: string | Date;
}

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
  const allFlags = [
    AllergyFlag.PENICILLIN,
    AllergyFlag.LATEX,
    AllergyFlag.ANESTHESIA,
    AllergyFlag.NSAIDS,
  ];

  return allFlags.filter((flag) => (mask & flag) === flag);
}

