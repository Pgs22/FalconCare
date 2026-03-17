export interface Patient {
  id: number;
  // El backend real puede tener más campos; se amplía cuando confirmemos el contrato.
  identityDocument?: string;
  firstName?: string;
  lastName?: string;
}

