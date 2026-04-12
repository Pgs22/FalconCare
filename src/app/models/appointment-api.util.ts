import type { Appointment } from './appointment.model';
import type { PatientVisitHistoryEntry } from './patient-visit-history.model';

/** Respuestas tipo API Platform / JSON-LD o array plano. */
export function extractApiCollection(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o['hydra:member'])) {
      return o['hydra:member'];
    }
    if (Array.isArray(o['member'])) {
      return o['member'];
    }
  }
  return [];
}

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

function pickNestedString(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') {
    return '';
  }
  return pickString(obj as Record<string, unknown>, keys);
}

/** Relación `treatment` (ManyToOne) en Doctrine: nombre del tratamiento. */
function pickTreatmentTitle(r: Record<string, unknown>): string {
  const t = r['treatment'];
  if (t && typeof t === 'object') {
    const name = pickNestedString(t, [
      'name',
      'label',
      'title',
      'type',
      'description',
    ]);
    if (name) {
      return name;
    }
  }
  return pickString(r, [
    'treatmentName',
    'treatment_name',
    'treatmentLabel',
    'treatment_label',
    'treatmentType',
    'treatment_type',
    'serviceName',
    'service_name',
    'procedureName',
    'procedure_name',
  ]);
}

function pickDoctorDisplay(r: Record<string, unknown>): string {
  const d = r['doctor'];
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    const full = pickString(o, ['fullName', 'full_name', 'name', 'displayName', 'display_name']);
    if (full) {
      return full;
    }
    const fn = pickString(o, ['firstName', 'first_name']);
    const ln = pickString(o, ['lastName', 'last_name']);
    const joined = [fn, ln].filter(Boolean).join(' ');
    if (joined) {
      return joined;
    }
  }
  return pickString(r, ['doctorName', 'doctor_name', 'dentist', 'professional', 'practitioner']);
}

function pickBoxDisplay(r: Record<string, unknown>): string {
  const b = r['box'];
  if (typeof b === 'number' && Number.isFinite(b)) {
    return `BOX ${b}`;
  }
  if (b && typeof b === 'object') {
    const label = pickNestedString(b, ['name', 'label', 'code', 'number']);
    if (label) {
      return label.startsWith('BOX') || label.startsWith('Box') ? label : `BOX ${label}`;
    }
  }
  const raw = pickString(r, [
    'box',
    'boxLabel',
    'box_label',
    'boxName',
    'box_name',
    'room',
    'chair',
    'operatory',
  ]);
  if (!raw) {
    return '';
  }
  if (/^box\s*\d+/i.test(raw) || /^BOX/i.test(raw)) {
    return raw.toUpperCase().startsWith('BOX') ? raw : `BOX ${raw}`;
  }
  return raw;
}

function parseOccurredAt(r: Record<string, unknown>): Date | null {
  /**
   * Primero: fecha + hora en columnas separadas (forma habitual en Neon: `appointment_date` + `time`).
   * Si leyéramos solo la fecha en el bloque ISO, todas las citas del día tendrían el mismo instante y el orden fallaría.
   */
  const datePart = pickString(r, [
    'appointmentDate',
    'appointment_date',
    'scheduledDate',
    'scheduled_date',
    'date',
  ]);
  const timeOnly = pickString(r, ['time', 'slotTime', 'slot_time', 'hour']);
  if (datePart && timeOnly && /^\d{4}-\d{2}-\d{2}/.test(datePart.trim())) {
    const t = timeOnly.trim();
    const hm = /^\d{1,2}:\d{2}(:\d{2})?/.test(t) ? (t.length === 5 ? `${t}:00` : t) : '';
    if (hm) {
      const combined = new Date(`${datePart.trim()}T${hm}`);
      if (!Number.isNaN(combined.getTime())) {
        return combined;
      }
    }
  }

  const raw = pickString(r, [
    'startTime',
    'start_time',
    'scheduledAt',
    'scheduled_at',
    'beginAt',
    'begin_at',
    'startsAt',
    'starts_at',
    'startAt',
    'start_at',
    'datetime',
    'date_time',
    'createdAt',
    'created_at',
    'updatedAt',
    'updated_at',
    'endTime',
    'end_time',
  ]);
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  /** Solo día calendario (sin hora): mediodía local para contadores por día sin colapsar orden arbitrario. */
  if (datePart && /^\d{4}-\d{2}-\d{2}/.test(datePart.trim())) {
    const noon = new Date(`${datePart.trim()}T12:00:00`);
    if (!Number.isNaN(noon.getTime())) {
      return noon;
    }
  }
  return null;
}

function buildDetailPrimary(r: Record<string, unknown>): string {
  return pickString(r, [
    'notes',
    'clinicalNotes',
    'clinical_notes',
    'observations',
    'description',
    'detail',
    'summary',
    'report',
    'clinicalReport',
    'clinical_report',
    'findings',
    'instructions',
    'comment',
    'comments',
  ]);
}

function buildMetaLine(
  r: Record<string, unknown>,
  occurredAt: Date | null,
  formatVisitDate: (d: Date | null) => string
): string | undefined {
  const parts: string[] = [];
  const doctor = pickDoctorDisplay(r);
  if (doctor) {
    parts.push(doctor);
  }
  const box = pickBoxDisplay(r);
  if (box) {
    parts.push(box);
  }
  const status = pickString(r, [
    'status',
    'state',
    'appointmentStatus',
    'appointment_status',
    'bookingStatus',
    'booking_status',
  ]);
  if (status) {
    parts.push(status);
  }
  const dur = r['duration'] ?? r['durationMinutes'] ?? r['duration_minutes'];
  if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
    parts.push(`${dur} min`);
  } else if (typeof dur === 'string' && dur.trim()) {
    parts.push(dur.trim());
  }
  const dateLabel = formatVisitDate(occurredAt);
  if (dateLabel) {
    parts.push(dateLabel);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' · ');
}

/**
 * Convierte un ítem crudo del API (camelCase / snake_case, relaciones embebidas) en entrada de historial.
 * Cubre columnas habituales de `appointment` en Neon/Doctrine.
 */
export function rawAppointmentToVisitEntry(raw: unknown): PatientVisitHistoryEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = Number(r['id']);
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }

  const treatmentTitle = pickTreatmentTitle(r);
  const title =
    treatmentTitle ||
    pickString(r, [
      'reason',
      'motive',
      'title',
      'type',
      'visitType',
      'visit_type',
      'consultationReason',
      'consultation_reason',
      'subject',
    ]) ||
    'Visita';

  const detailPrimary = buildDetailPrimary(r);
  const occurredAt = parseOccurredAt(r);

  let detail = detailPrimary;
  if (!detail) {
    const piece = pickString(r, ['tooth', 'toothNumber', 'tooth_number', 'piece', 'quadrant']);
    if (piece) {
      detail = `Pieza / zona: ${piece}`;
    }
  }

  const metaLine = buildMetaLine(r, occurredAt, formatVisitDateLabel);

  return {
    id,
    title,
    detail,
    occurredAt,
    metaLine,
  };
}

export function sortVisitHistoryEntries(entries: PatientVisitHistoryEntry[]): PatientVisitHistoryEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.occurredAt?.getTime() ?? 0;
    const tb = b.occurredAt?.getTime() ?? 0;
    if (tb !== ta) {
      return tb - ta;
    }
    return b.id - a.id;
  });
}

/** Fecha efectiva de la cita (mismos campos que `parseOccurredAt` / tabla `appointment` en Neon). */
export function rawAppointmentOccurredAt(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return parseOccurredAt(raw as Record<string, unknown>);
}

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Citas cuyo instante cae en el día local indicado (p. ej. hoy). */
export function countAppointmentsOnLocalDate(rows: unknown[], day: Date): number {
  let n = 0;
  for (const row of rows) {
    const d = rawAppointmentOccurredAt(row);
    if (d && isSameLocalCalendarDay(d, day)) {
      n++;
    }
  }
  return n;
}

function normalizeDashboardStatusToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

/** Estados que en API/BD indican revisión clínica o resultados pendientes (extensible). */
const PENDING_CLINICAL_REVIEW_STATUS = new Set([
  'pending_review',
  'results_pending',
  'awaiting_review',
  'revision_pendiente',
  'pendiente_revision',
  'pendiente_resultados',
  'pending_results',
  'pending_clinical_review',
  'lab_pending',
  'study_pending',
]);

/**
 * Filas de `appointment` (u homólogo) que requieren revisión de estudios / laboratorio.
 * No usa el estado genérico `pending` (suele ser “cita pendiente”), para no inflar el contador.
 */
export function countAppointmentsPendingClinicalReview(rows: unknown[]): number {
  let n = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const statusRaw = pickString(r, [
      'status',
      'appointmentStatus',
      'appointment_status',
      'state',
      'bookingStatus',
      'booking_status',
    ]);
    const norm = normalizeDashboardStatusToken(statusRaw);
    if (norm && PENDING_CLINICAL_REVIEW_STATUS.has(norm)) {
      n++;
      continue;
    }
    const review =
      r['reviewRequired'] ??
      r['review_required'] ??
      r['needsReview'] ??
      r['needs_review'] ??
      r['needsClinicalReview'] ??
      r['needs_clinical_review'];
    if (review === true || review === 1 || review === '1' || review === 'true') {
      n++;
      continue;
    }
    const study = pickString(r, [
      'studyStatus',
      'study_status',
      'labResultStatus',
      'lab_result_status',
      'imagingStatus',
      'imaging_status',
    ]);
    const sn = normalizeDashboardStatusToken(study);
    if (sn && (sn.includes('pend') || sn.includes('pending') || sn.includes('await'))) {
      n++;
    }
  }
  return n;
}

/**
 * Variación porcentual de citas respecto al día local anterior (misma fuente de filas).
 * `null` si ayer fue 0 (evita divisiones engañosas).
 */
export function appointmentCountDeltaPercentVsPreviousLocalDay(rows: unknown[], today: Date): number | null {
  const t = countAppointmentsOnLocalDate(rows, today);
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yCount = countAppointmentsOnLocalDate(rows, y);
  if (yCount <= 0) {
    return null;
  }
  return Math.round(((t - yCount) / yCount) * 100);
}

/** KPIs del doctor-panel: misma colección que `GET /api/appointment` (agenda) y filas `appointment` en Neon. */
export function computeDoctorDashboardKpis(rows: unknown[], at: Date = new Date()) {
  return {
    patientsTodayCount: countAppointmentsOnLocalDate(rows, at),
    pendingClinicalReviewCount: countAppointmentsPendingClinicalReview(rows),
    patientsTodayDeltaPct: appointmentCountDeltaPercentVsPreviousLocalDay(rows, at),
  };
}

/** Normaliza un registro API a la forma usada por la vista agenda (boxes). */
export function rawToAgendaAppointment(raw: unknown): Appointment {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = Number(r['id'] ?? 0);
  const time = String(
    r['time'] ?? r['startTime'] ?? r['start_time'] ?? r['scheduledAt'] ?? ''
  );
  const duration = Number(r['duration'] ?? r['durationMinutes'] ?? r['duration_minutes'] ?? 30) || 30;
  const status = String(r['status'] ?? 'pending');
  const patientName = String(
    r['patientName'] ?? r['patient_name'] ?? r['patient'] ?? '—'
  );
  const doctorName = String(r['doctorName'] ?? r['doctor_name'] ?? r['doctor'] ?? '—');
  const box = String(r['box'] ?? r['boxLabel'] ?? r['box_label'] ?? 'BOX 1');
  const reason = String(r['reason'] ?? r['motive'] ?? '');
  return {
    id,
    time,
    duration,
    status,
    patientName,
    doctorName,
    box,
    reason,
  };
}

export function formatVisitDateLabel(d: Date | null): string {
  if (!d) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Alerta de alergia en el doctor-panel (citas del día × `medication_allergies` en Neon). */
export type DoctorAllergyAlertVariant = 'red' | 'amber';

export type DoctorAllergyAlertIcon = 'medical_services' | 'medical_information' | 'vaccines';

export interface DoctorAllergyAlert {
  /** `id` de la fila `appointment` en Neon (o identificador sintético estable si la API no lo envía). */
  readonly appointmentId: number;
  /** Expediente (`/patient-panel/:id`); `null` si la API no enlaza paciente. */
  readonly patientId: number | null;
  readonly patientName: string;
  readonly timeLabel: string;
  readonly allergySummary: string;
  readonly variant: DoctorAllergyAlertVariant;
  readonly icon: DoctorAllergyAlertIcon;
}

const ALLERGY_ALERT_ICONS: readonly DoctorAllergyAlertIcon[] = [
  'medical_services',
  'medical_information',
  'vaccines',
];

/**
 * Campos de alergias en objeto paciente (embebido en cita o `GET /api/patients/{id}`).
 * Alineado con `PatientService.toApiPatientBody` → columna Neon `medication_allergies`.
 */
export function pickMedicationAllergiesFromPatientRecord(o: Record<string, unknown>): string {
  return pickString(o, [
    'medicationAllergies',
    'medication_allergies',
    'allergies',
    'criticalAllergies',
    'critical_allergies',
  ]);
}

/** Respuesta de `GET /api/patients/{id}` (JSON plano o embebido en cita). */
export function pickMedicationAllergiesFromPatientApiPayload(p: unknown): string {
  if (!p || typeof p !== 'object') {
    return '';
  }
  return pickMedicationAllergiesFromPatientRecord(p as Record<string, unknown>);
}

/**
 * Parsea el texto almacenado en `medication_allergies` (Neon): separadores `,` / `;`,
 * mayúsculas ES, placeholders ignorados — misma regla que `patient-panel`.
 */
export function parseMedicationAllergiesDbString(raw: string): string[] {
  if (!raw?.trim()) {
    return [];
  }
  const placeholders = new Set(['SIN INFORMACIÓN INICIAL', 'N/A', '—', '-']);
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const label = part.trim().toLocaleUpperCase('es-ES');
    if (!label || placeholders.has(label) || seen.has(label)) {
      continue;
    }
    seen.add(label);
    out.push(label);
  }
  return out;
}

function pickPatientDisplayFromAppointmentRaw(r: Record<string, unknown>): string {
  const p = r['patient'];
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    const full = pickString(o, ['fullName', 'full_name', 'name', 'displayName', 'display_name']);
    if (full) {
      return full;
    }
    const fn = pickString(o, ['firstName', 'first_name']);
    const ln = pickString(o, ['lastName', 'last_name']);
    const joined = [fn, ln].filter(Boolean).join(' ').trim();
    if (joined) {
      return joined;
    }
  }
  return pickString(r, [
    'patientName',
    'patient_name',
    'patientFullName',
    'patient_full_name',
  ]);
}

function pickMedicationAllergiesFromAppointmentRow(r: Record<string, unknown>): string {
  const p = r['patient'];
  if (p && typeof p === 'object') {
    const a = pickMedicationAllergiesFromPatientRecord(p as Record<string, unknown>);
    if (a) {
      return a;
    }
  }
  return pickString(r, [
    'patientMedicationAllergies',
    'patient_medication_allergies',
    'medicationAllergies',
    'medication_allergies',
  ]);
}

/** Identificador de paciente en filas `appointment` (IRI, objeto embebido o `patient_id`). */
export function pickAppointmentPatientId(r: Record<string, unknown>): number | null {
  const p = r['patient'];
  if (typeof p === 'number' && Number.isFinite(p) && p >= 1) {
    return p;
  }
  if (typeof p === 'string') {
    const m = p.match(/\/(?:patients\/)?(\d+)\s*$/);
    if (m) {
      const id = Number(m[1]);
      if (Number.isFinite(id) && id >= 1) {
        return id;
      }
    }
  }
  if (p && typeof p === 'object') {
    const id = Number((p as Record<string, unknown>)['id']);
    if (Number.isFinite(id) && id >= 1) {
      return id;
    }
  }
  const pid = Number(r['patientId'] ?? r['patient_id']);
  if (Number.isFinite(pid) && pid >= 1) {
    return pid;
  }
  return null;
}

function formatAppointmentTimeHm(occurredAt: Date | null, r: Record<string, unknown>): string {
  if (occurredAt && !Number.isNaN(occurredAt.getTime())) {
    try {
      return new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(occurredAt);
    } catch {
      /* fall through */
    }
  }
  const t = pickString(r, ['time', 'slotTime', 'slot_time', 'hour', 'startTime', 'start_time']);
  if (t && /^\d{1,2}:\d{2}/.test(t.trim())) {
    return t.trim().slice(0, 5);
  }
  return '—';
}

/** Heurística de tarjeta ámbar (sensibilidad) vs roja (resto), alineada con estilos `allergy-card-*`. */
export function classifyAllergyAlertVariant(firstAllergyUpper: string): DoctorAllergyAlertVariant {
  const n = firstAllergyUpper.toLocaleLowerCase('es-ES');
  if (
    /\b(latex|látex)\b/.test(n) ||
    /\b(iodo|yodo|contrast|contraste)\b/.test(n) ||
    /\b(pegamento|adhesiv|esparadrap|curita|plaste)\b/.test(n)
  ) {
    return 'amber';
  }
  return 'red';
}

/**
 * IDs de paciente cuyas citas son hoy pero la fila de cita no trae aún `medication_allergies` embebido;
 * el front puede completar con `GET /api/patients/{id}` (Neon).
 */
export function collectPatientIdsNeedingAllergyFetch(rows: unknown[], at: Date): number[] {
  const need = new Set<number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const d = rawAppointmentOccurredAt(row);
    if (!d || !isSameLocalCalendarDay(d, at)) {
      continue;
    }
    const embedded = pickMedicationAllergiesFromAppointmentRow(r);
    if (parseMedicationAllergiesDbString(embedded).length > 0) {
      continue;
    }
    const id = pickAppointmentPatientId(r);
    if (id != null) {
      need.add(id);
    }
  }
  return Array.from(need);
}

type DoctorAllergyAlertRow = DoctorAllergyAlert & { readonly _sortTime: number };

/**
 * Citas del día local `at` con al menos una alergia en `medication_allergies` (embebida o mapa `extraByPatientId`).
 */
export function buildDoctorAllergyAlertsForToday(
  rows: unknown[],
  at: Date,
  extraAllergiesByPatientId: ReadonlyMap<number, string>
): DoctorAllergyAlert[] {
  const built: DoctorAllergyAlertRow[] = [];
  let idx = 0;
  let syntheticAppointmentId = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const occurredAt = rawAppointmentOccurredAt(row);
    if (!occurredAt || !isSameLocalCalendarDay(occurredAt, at)) {
      continue;
    }
    let allergyRaw = pickMedicationAllergiesFromAppointmentRow(r);
    const pid = pickAppointmentPatientId(r);
    if (!allergyRaw.trim() && pid != null) {
      allergyRaw = extraAllergiesByPatientId.get(pid) ?? '';
    }
    const items = parseMedicationAllergiesDbString(allergyRaw);
    if (items.length === 0) {
      continue;
    }
    const rawApptId = Number(r['id']);
    const appointmentId =
      Number.isFinite(rawApptId) && rawApptId >= 1 ? rawApptId : --syntheticAppointmentId;
    const patientName = pickPatientDisplayFromAppointmentRaw(r) || 'Paciente';
    const timeLabel = formatAppointmentTimeHm(occurredAt, r);
    const allergySummary = items.join(' · ');
    const variant = classifyAllergyAlertVariant(items[0]);
    const icon = ALLERGY_ALERT_ICONS[idx % ALLERGY_ALERT_ICONS.length]!;
    idx++;
    built.push({
      appointmentId,
      patientId: pid,
      patientName,
      timeLabel,
      allergySummary,
      variant,
      icon,
      _sortTime: occurredAt.getTime(),
    });
  }
  built.sort((a, b) => a._sortTime - b._sortTime);
  return built.map(({ _sortTime: _t, ...rest }) => rest);
}

function pickDurationMinutes(r: Record<string, unknown>): number {
  const dur = r['duration'] ?? r['durationMinutes'] ?? r['duration_minutes'];
  if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
    return Math.round(dur);
  }
  if (typeof dur === 'string' && dur.trim()) {
    const n = Number.parseInt(dur.replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return 30;
}

function boxBadgeTailwindFromLabel(boxLabel: string): string {
  const m = boxLabel.match(/(\d+)/);
  const mod = m ? Number.parseInt(m[1]!, 10) % 3 : 0;
  const presets = [
    'px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20',
    'px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-bold border border-gray-300 dark:border-gray-600',
    'px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-bold border border-purple-200 dark:border-purple-800',
  ];
  return presets[mod] ?? presets[0];
}

/** Variante visual del chip de estado (columna `status` en `appointment`). */
export type DoctorAgendaStatusPillVariant = 'green' | 'blue' | 'yellow' | 'slate';

/**
 * Mapea `status` de Neon/API (inglés o español) a etiqueta y color del doctor-panel.
 */
export function mapAppointmentStatusToAgendaUi(statusRaw: string): {
  label: string;
  variant: DoctorAgendaStatusPillVariant;
} {
  const n = normalizeDashboardStatusToken(statusRaw);
  if (!n) {
    return { label: 'Sin estado', variant: 'slate' };
  }
  if (
    n.includes('in_progress') ||
    n.includes('en_curso') ||
    n === 'started' ||
    n === 'active' ||
    n === 'ongoing'
  ) {
    return { label: 'En curso', variant: 'green' };
  }
  if (n.includes('arriv') || n.includes('llegad') || n.includes('checked_in') || n.includes('present')) {
    return { label: 'Llegada', variant: 'yellow' };
  }
  if (n.includes('confirm') || n.includes('scheduled') || n.includes('program')) {
    return { label: 'Confirmado', variant: 'blue' };
  }
  if (n.includes('cancel') || n.includes('anulad')) {
    return { label: 'Cancelada', variant: 'slate' };
  }
  if (n.includes('complet') || n.includes('finaliz') || n === 'done' || n === 'finished' || n === 'closed') {
    return { label: 'Finalizada', variant: 'slate' };
  }
  if (n === 'pending' || n === 'pendiente') {
    return { label: 'Pendiente', variant: 'slate' };
  }
  const raw = statusRaw.trim();
  return { label: raw || 'Sin estado', variant: 'slate' };
}

/** Fila de «Agenda de hoy»: solo citas reales del día (tabla `appointment` vía API). */
export interface DoctorAgendaRow {
  readonly appointmentId: number;
  /** `null` si la API no envía vínculo a paciente (no se puede abrir expediente). */
  readonly patientId: number | null;
  readonly startTimeLabel: string;
  readonly durationMinutes: number;
  readonly durationLabel: string;
  readonly patientName: string;
  readonly metaLine: string;
  readonly boxLabel: string;
  readonly boxBadgeClass: string;
  readonly statusLabel: string;
  readonly statusPillVariant: DoctorAgendaStatusPillVariant;
  readonly highlightLeftBorder: boolean;
}

export interface BuildDoctorAgendaOptions {
  /** Para marcar «En curso» / siguiente cita (por defecto el caller usa `new Date()`). */
  readonly now?: Date;
  readonly fallbackDoctorDisplay?: string;
}

/**
 * Citas del día local `day` ordenadas por hora; datos alineados con `rawAppointmentOccurredAt`,
 * `pickPatientDisplayFromAppointmentRaw`, `pickDoctorDisplay`, `pickTreatmentTitle`, `pickBoxDisplay`, `status`.
 */
export function buildDoctorAgendaRowsForToday(
  rows: unknown[],
  day: Date,
  options?: BuildDoctorAgendaOptions
): DoctorAgendaRow[] {
  const now = options?.now ?? new Date();
  const fallbackDr = options?.fallbackDoctorDisplay?.trim() ?? '';

  type Item = { r: Record<string, unknown>; occurredAt: Date; id: number };
  const list: Item[] = [];
  let syntheticId = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const r = row as Record<string, unknown>;
    const occurredAt = rawAppointmentOccurredAt(row);
    if (!occurredAt || !isSameLocalCalendarDay(occurredAt, day)) {
      continue;
    }
    const rawId = Number(r['id']);
    const id = Number.isFinite(rawId) && rawId >= 1 ? rawId : --syntheticId;
    list.push({ r, occurredAt, id });
  }
  list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let highlightId: number | null = null;
  for (const item of list) {
    const durMin = pickDurationMinutes(item.r);
    const end = new Date(item.occurredAt.getTime() + durMin * 60_000);
    if (now >= item.occurredAt && now < end) {
      highlightId = item.id;
      break;
    }
  }
  if (highlightId == null) {
    for (const item of list) {
      if (item.occurredAt > now) {
        highlightId = item.id;
        break;
      }
    }
  }

  return list.map((item) => {
    const { r, occurredAt, id } = item;
    const patientName = pickPatientDisplayFromAppointmentRaw(r) || 'Paciente';
    const doctor = pickDoctorDisplay(r) || fallbackDr;
    const treatment = pickTreatmentTitle(r);
    const metaParts: string[] = [];
    if (doctor) {
      metaParts.push(doctor);
    }
    if (treatment) {
      metaParts.push(treatment);
    }
    const metaLine = metaParts.length > 0 ? metaParts.join(' · ') : doctor || treatment || '—';

    const durationMinutes = pickDurationMinutes(r);
    const startTimeLabel = formatAppointmentTimeHm(occurredAt, r);
    const statusRaw = pickString(r, [
      'status',
      'appointmentStatus',
      'appointment_status',
      'state',
      'bookingStatus',
      'booking_status',
    ]);
    const ui = mapAppointmentStatusToAgendaUi(statusRaw);
    const boxLabel = pickBoxDisplay(r) || 'BOX';
    const boxBadgeClass = boxBadgeTailwindFromLabel(boxLabel);
    const patientId = pickAppointmentPatientId(r);

    return {
      appointmentId: id,
      patientId,
      startTimeLabel,
      durationMinutes,
      durationLabel: `${durationMinutes} min`,
      patientName,
      metaLine,
      boxLabel,
      boxBadgeClass,
      statusLabel: ui.label,
      statusPillVariant: ui.variant,
      highlightLeftBorder: highlightId != null && id === highlightId,
    };
  });
}
