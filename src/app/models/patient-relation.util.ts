/**
 * Extrae el id numérico del segmento `/patients/{id}` en una IRI o ruta (no confunde 1 con 11).
 */
export function extractPatientIdFromApiRef(ref: string): number | null {
  const m = ref.match(/\/patients\/(\d+)(?:\/|\?|#|$|")/);
  return m ? Number(m[1]) : null;
}

function stringPatientRefMatches(ref: string, patientId: number, looseWhenUnparseable: boolean): boolean {
  const t = ref.trim();
  if (/^\d+$/.test(t)) {
    return Number(t) === patientId;
  }
  const extracted = extractPatientIdFromApiRef(ref);
  if (extracted != null) {
    return extracted === patientId;
  }
  return looseWhenUnparseable;
}

/**
 * Indica si un ítem de colección API (citas, documentos, etc.) pertenece al paciente dado.
 * Si el backend no envía relación explícita, se asume que la colección ya vino filtrada.
 */
export function belongsToPatientRelation(row: unknown, patientId: number): boolean {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const r = row as Record<string, unknown>;
  const p = r['patient'] ?? r['patientId'] ?? r['patient_id'];
  if (p == null) {
    return true;
  }
  if (typeof p === 'number') {
    return p === patientId;
  }
  if (typeof p === 'string') {
    return stringPatientRefMatches(p, patientId, true);
  }
  if (typeof p === 'object' && p !== null) {
    const o = p as Record<string, unknown>;
    if ('id' in o) {
      const id = Number(o['id']);
      if (Number.isFinite(id)) {
        return id === patientId;
      }
    }
    const iri = o['@id'];
    if (typeof iri === 'string') {
      const extracted = extractPatientIdFromApiRef(iri);
      if (extracted != null) {
        return extracted === patientId;
      }
    }
    return true;
  }
  return true;
}

/**
 * Igual que arriba pero **exige** relación explícita al paciente.
 * Para `documents`: si el API devuelve la colección sin filtrar o sin `patient` en cada ítem,
 * aquí se descartan filas no verificables (evita mostrar documentos de otros pacientes).
 */
export function belongsToPatientRelationStrict(row: unknown, patientId: number): boolean {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const r = row as Record<string, unknown>;
  const p = r['patient'] ?? r['patientId'] ?? r['patient_id'];
  if (p == null) {
    return false;
  }
  if (typeof p === 'number') {
    return p === patientId;
  }
  if (typeof p === 'string') {
    return stringPatientRefMatches(p, patientId, false);
  }
  if (typeof p === 'object' && p !== null) {
    const o = p as Record<string, unknown>;
    if ('id' in o) {
      const id = Number(o['id']);
      if (Number.isFinite(id) && id === patientId) {
        return true;
      }
    }
    const iri = o['@id'];
    if (typeof iri === 'string') {
      const extracted = extractPatientIdFromApiRef(iri);
      if (extracted != null) {
        return extracted === patientId;
      }
    }
  }
  return false;
}
