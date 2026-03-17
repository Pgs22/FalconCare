export interface Document {
  id: number;
  type?: string;
  description?: string | null;
  captureDate?: string;
  patient?: { id: number };
}

