/**
 * Entrada del historial de visitas en el panel del paciente (UI),
 * derivada de registros de la tabla `appointment` expuestos por la API.
 */
export interface PatientVisitHistoryEntry {
  id: number;
  /** Motivo / tratamiento / tipo de cita (reason, treatment, treatment.name, …). */
  title: string;
  /** Notas clínicas u observaciones principales. */
  detail: string;
  /** Fecha/hora de la cita (ordenación y metadatos). */
  occurredAt: Date | null;
  /**
   * Línea secundaria opcional: doctor, box, estado, fecha (resto de columnas útiles).
   * No sustituye al diseño de dos líneas principales; complementa con datos reales.
   */
  metaLine?: string;
}
