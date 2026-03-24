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
  registrationDate?: string | Date;
}

