export interface Document {
  id: number;
  type?: string;
  description?: string | null;
  captureDate?: string;
  /** Alias que puede enviar el backend junto a `patient`. */
  patientId?: number;
  patient?: { id?: number; '@id'?: string };
  '@id'?: string;
}

