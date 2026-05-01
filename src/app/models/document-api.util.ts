/** Vista de lista para el panel del paciente (mapeo flexible del JSON de Symfony / API Platform). */
export type PatientDocumentView = {
  id: number;
  displayName: string;
  iconKind: 'image' | 'pdf' | 'other';
  typeLabel?: string;
  capturedAtIso?: string;
};

function pickString(r: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = r[key];
    if (v == null) {
      continue;
    }
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return String(v);
    }
  }
  return '';
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? path;
}

/** Nombre mostrable: metadatos del API o último segmento de ruta almacenada. */
export function documentDisplayNameFromRaw(raw: Record<string, unknown>): string {
  const direct = pickString(raw, [
    'originalName',
    'original_name',
    'originalFilename',
    'original_filename',
    'fileName',
    'file_name',
    'filename',
    'name',
    'title',
  ]);
  if (direct) {
    return direct;
  }
  const path = pickString(raw, ['path', 'filePath', 'file_path', 'url', 'fileUrl', 'file_url']);
  if (path) {
    const b = basename(path);
    if (b) {
      return b;
    }
  }
  const id = raw['id'];
  return `Documento #${id ?? '?'}`;
}

/** Tipo enviado al POST `/api/documents`: MIME real o binario genérico. */
export function documentTypeForUpload(file: File): string {
  const t = file.type?.trim();
  return t.length > 0 ? t : 'application/octet-stream';
}

export function mapUnknownToPatientDocumentView(raw: unknown): PatientDocumentView | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = Number(r['id']);
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }
  const displayName = documentDisplayNameFromRaw(r);
  const mime = pickString(r, ['mimeType', 'mime_type', 'mime', 'contentType', 'content_type']).toLowerCase();
  const typeField = String(r['type'] ?? '').toLowerCase();
  const nameLower = displayName.toLowerCase();

  let iconKind: PatientDocumentView['iconKind'] = 'other';
  if (
    mime.startsWith('image/') ||
    typeField.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff)$/i.test(nameLower)
  ) {
    iconKind = 'image';
  } else if (mime === 'application/pdf' || typeField === 'application/pdf' || nameLower.endsWith('.pdf')) {
    iconKind = 'pdf';
  }

  const typeLabel = pickString(r, ['type', 'mimeType', 'mime_type', 'mime', 'contentType', 'content_type']);
  const capturedAtIso = pickString(r, ['captureDate', 'capture_date', 'createdAt', 'created_at']);
  return {
    id,
    displayName,
    iconKind,
    typeLabel: typeLabel || undefined,
    capturedAtIso: capturedAtIso || undefined,
  };
}
