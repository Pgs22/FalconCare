import {
  appointmentCountDeltaPercentVsPreviousLocalDay,
  buildDoctorAgendaRowsForToday,
  buildDoctorAllergyAlertsForToday,
  classifyAllergyAlertVariant,
  collectPatientIdsNeedingAllergyFetch,
  computeDoctorDashboardKpis,
  countAppointmentsOnLocalDate,
  countAppointmentsPendingClinicalReview,
  mapAppointmentStatusToAgendaUi,
  parseMedicationAllergiesDbString,
  pickMedicationAllergiesFromPatientApiPayload,
  pickMedicationAllergiesFromPatientRecord,
  rawAppointmentOccurredAt,
  rawToAgendaAppointment,
} from './appointment-api.util';

describe('appointment-api.util (agenda / doctor-panel / Neon shapes)', () => {
  const fmtBerlinHm = (d: Date | null): string =>
    d
      ? new Intl.DateTimeFormat('es-ES', {
          timeZone: 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit',
        }).format(d)
      : '';

  it('countAppointmentsOnLocalDate matches local calendar day', () => {
    const day = new Date(2026, 3, 8, 12, 0, 0);
    const rows = [
      { id: 1, startTime: '2026-04-08T09:00:00' },
      { id: 2, startTime: '2026-04-07T09:00:00' },
    ];
    expect(countAppointmentsOnLocalDate(rows, day)).toBe(1);
  });

  it('rawAppointmentOccurredAt combines ISO date + time HH:mm', () => {
    const d = rawAppointmentOccurredAt({
      appointment_date: '2026-04-08',
      time: '09:00',
    });
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(8);
    expect(fmtBerlinHm(d)).toBe('09:00');
  });

  it('rawAppointmentOccurredAt treats naive startTime as Frankfurt local time', () => {
    const d = rawAppointmentOccurredAt({
      startTime: '2026-01-15T09:00:00',
    });
    expect(d).not.toBeNull();
    expect(fmtBerlinHm(d)).toBe('09:00');
  });

  it('rawAppointmentOccurredAt keeps explicit UTC/Z offsets consistent with Frankfurt', () => {
    const d = rawAppointmentOccurredAt({
      startTime: '2026-07-15T07:00:00Z',
    });
    expect(d).not.toBeNull();
    // 07:00Z in summer equals 09:00 in Frankfurt (CEST).
    expect(fmtBerlinHm(d)).toBe('09:00');
  });

  it('rawToAgendaAppointment renders time label in Frankfurt timezone', () => {
    const appt = rawToAgendaAppointment({
      id: 10,
      appointment_date: '2026-07-15',
      time: '09:30',
      status: 'confirmed',
      patientName: 'Paciente Demo',
      doctorName: 'Dr Demo',
      box: 'BOX 1',
      reason: 'Control',
    });
    expect(appt.time).toBe('09:30');
  });

  it('countAppointmentsPendingClinicalReview detects review flags', () => {
    expect(
      countAppointmentsPendingClinicalReview([
        { id: 1, status: 'confirmed' },
        { id: 2, status: 'pending_review' },
        { id: 3, needsReview: true },
        { id: 4, needs_clinical_review: true },
      ])
    ).toBe(3);
  });

  it('appointmentCountDeltaPercentVsPreviousLocalDay uses yesterday count', () => {
    const today = new Date(2026, 3, 8, 10, 0, 0);
    const rows = [
      { id: 1, startTime: '2026-04-08T10:00:00' },
      { id: 2, startTime: '2026-04-08T11:00:00' },
      { id: 3, startTime: '2026-04-07T10:00:00' },
    ];
    expect(appointmentCountDeltaPercentVsPreviousLocalDay(rows, today)).toBe(100);
  });

  it('computeDoctorDashboardKpis aggregates counts', () => {
    const at = new Date(2026, 3, 8, 12, 0, 0);
    const k = computeDoctorDashboardKpis(
      [
        { id: 1, startTime: '2026-04-08T10:00:00' },
        { id: 2, status: 'pending_review' },
      ],
      at
    );
    expect(k.patientsTodayCount).toBe(1);
    expect(k.pendingClinicalReviewCount).toBe(1);
  });

  it('parseMedicationAllergiesDbString matches patient-panel separators', () => {
    expect(parseMedicationAllergiesDbString('Penicilina, Látex')).toEqual(['PENICILINA', 'LÁTEX']);
    expect(parseMedicationAllergiesDbString('Sin información inicial')).toEqual([]);
  });

  it('pickMedicationAllergiesFromPatientApiPayload reads snake_case from API', () => {
    expect(pickMedicationAllergiesFromPatientApiPayload({ medication_allergies: 'X' })).toBe('X');
    expect(pickMedicationAllergiesFromPatientApiPayload({ medicationAllergies: 'Y' })).toBe('Y');
    expect(pickMedicationAllergiesFromPatientApiPayload(null)).toBe('');
  });

  it('pickMedicationAllergiesFromPatientRecord matches PatientService / Neon keys', () => {
    expect(pickMedicationAllergiesFromPatientRecord({ medication_allergies: 'A' })).toBe('A');
    expect(pickMedicationAllergiesFromPatientRecord({ critical_allergies: 'B' })).toBe('B');
  });

  it('classifyAllergyAlertVariant marks latex as amber', () => {
    expect(classifyAllergyAlertVariant('LÁTEX')).toBe('amber');
    expect(classifyAllergyAlertVariant('PENICILINA')).toBe('red');
  });

  it('buildDoctorAllergyAlertsForToday uses embedded patient medication_allergies', () => {
    const at = new Date(2026, 3, 8, 12, 0, 0);
    const rows = [
      {
        id: 1,
        startTime: '2026-04-08T09:00:00',
        patient: {
          id: 42,
          firstName: 'Ana',
          lastName: 'López',
          medication_allergies: 'Penicilina',
        },
      },
    ];
    const alerts = buildDoctorAllergyAlertsForToday(rows, at, new Map());
    expect(alerts.length).toBe(1);
    expect(alerts[0].appointmentId).toBe(1);
    expect(alerts[0].patientId).toBe(42);
    expect(alerts[0].patientName).toContain('Ana');
    expect(alerts[0].allergySummary).toContain('PENICILINA');
    expect(alerts[0].variant).toBe('red');
  });

  it('collectPatientIdsNeedingAllergyFetch asks for patient when allergies missing on row', () => {
    const at = new Date(2026, 3, 8, 12, 0, 0);
    const rows = [{ id: 1, startTime: '2026-04-08T10:00:00', patientId: 99 }];
    expect(collectPatientIdsNeedingAllergyFetch(rows, at)).toEqual([99]);
  });

  it('mapAppointmentStatusToAgendaUi maps API status tokens', () => {
    expect(mapAppointmentStatusToAgendaUi('confirmed').variant).toBe('blue');
    expect(mapAppointmentStatusToAgendaUi('in_progress').variant).toBe('green');
    expect(mapAppointmentStatusToAgendaUi('llegada').variant).toBe('yellow');
  });

  it('buildDoctorAgendaRowsForToday sorts and maps Neon-shaped rows', () => {
    const day = new Date(2026, 3, 8, 12, 0, 0);
    const now = new Date(2026, 3, 8, 9, 20, 0);
    const rows = [
      {
        id: 2,
        appointment_date: '2026-04-08',
        time: '11:00',
        duration: 30,
        status: 'confirmed',
        patient: { id: 2, firstName: 'Zoe', lastName: 'Later' },
        treatment: { name: 'Extracción' },
        box: 3,
      },
      {
        id: 1,
        appointment_date: '2026-04-08',
        time: '09:00',
        duration: 45,
        status: 'in_progress',
        patient: { id: 1, firstName: 'Ana', lastName: 'Early' },
        treatment: { name: 'Endodoncia' },
        box: 1,
      },
    ];
    const agenda = buildDoctorAgendaRowsForToday(rows, day, {
      now,
      fallbackDoctorDisplay: 'Dr. Demo',
    });
    expect(agenda.length).toBe(2);
    expect(agenda[0].appointmentId).toBe(1);
    expect(agenda[0].patientId).toBe(1);
    expect(agenda[0].patientName).toContain('Ana');
    expect(agenda[0].highlightLeftBorder).toBe(true);
    expect(agenda[1].appointmentId).toBe(2);
    expect(agenda[1].boxLabel).toContain('BOX');
    expect(agenda[1].statusPillVariant).toBe('blue');
  });
});
