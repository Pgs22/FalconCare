export interface Document {
  id: number;
  type?: string;
  mimeType?: string;
  mime_type?: string;
  description?: string | null;
  notes?: string | null;
  clinicalNotes?: string | null;
  clinical_notes?: string | null;
  captureDate?: string;
  capture_date?: string;
  created_at?: string;
  file_name?: string;
  original_filename?: string;
  fileUrl?: string;
  file_url?: string;
  patient_id?: number;
  patientId?: number;
  patient?: { id?: number; '@id'?: string };
  '@id'?: string;
}
