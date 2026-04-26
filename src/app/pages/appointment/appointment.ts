import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppointmentService, Appointment } from '../../services/appointment.service';
import { FormsModule } from '@angular/forms';
import {
  parseMedicationAllergiesDbString,
  pickMedicationAllergiesFromPatientApiPayload,
  pickAppointmentPatientId,
  rawAppointmentOccurredAt,
} from '../../models/appointment-api.util';
import { AllergyFlag, selectedAllergiesFromBitmask } from '../../models/patient.model';
import { catchError, of } from 'rxjs';

type ApiRecord = Record<string, unknown>;
const BOX_CLEANING_BUFFER_MINUTES = 5;

interface DayAllergySummaryItem {
  label: string;
  patientNames: string[];
  patientCount: number;
}

interface WeekDayItem {
  date: string;
  label: string;
}

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './appointment.html',
  styleUrl: './appointment.css',
})

export class AppointmentComponent implements OnInit {
  private errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

  private selectedTreatment: {
    treatmentId: number;
    pathologyId: number | null;
    durationMinutes: number;
    treatmentName: string;
  } | null = null;

  today = new Date();
  readonly dayStartHour = 8;
  readonly dayEndHour = 20;
  readonly hourSlotHeightPx = 150;
  readonly boxHeaderHeightPx = 52;
  readonly dayHours = Array.from(
    { length: this.dayEndHour - this.dayStartHour + 1 },
    (_, idx) => `${String(this.dayStartHour + idx).padStart(2, '0')}:00`
  );
  readonly appointmentHourOptions = Array.from(
    { length: this.dayEndHour - this.dayStartHour + 1 },
    (_, idx) => String(this.dayStartHour + idx).padStart(2, '0')
  );
  readonly appointmentMinuteOptions = Array.from(
    { length: 12 },
    (_, idx) => String(idx * 5).padStart(2, '0')
  );
  readonly dayGridHeightPx = (this.dayHours.length - 1) * this.hourSlotHeightPx;

  appointments = signal<Appointment[]>([]);
  viewMode = signal<'day' | 'week'>('day');
  weekDays = signal<WeekDayItem[]>([]);
  weeklyAppointments = signal<Record<string, Appointment[]>>({});
  dayAllergySummary = signal<DayAllergySummaryItem[]>([]);
  patientsList = signal<any[]>([]);
  doctorsList = signal<any[]>([]);
  boxesList = signal<any[]>([]);
  selectedBoxKeys = signal<string[]>([]);
  selectedWeekBoxKey = signal<string | null>(null);
  selectedWeekDoctorKey = signal<string>('all');
  statusUpdatingIds = signal<number[]>([]);
  readonly appointmentStatusOptions: string[] = [
    'Confirmada',
    'Arribada',
    'Cancelada',
  ];
  quickActionsAppointmentId = signal<number | null>(null);
  cleaningSelectorAppointmentId = signal<number | null>(null);
  pathologiesList = signal<any[]>([]);
  treatmentsList = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  createFormError = signal<string | null>(null);
  createFormFieldErrors = signal<Record<string, string>>({});
  showForm = signal(false);
  isEditMode = false;
  private editingAppointmentId: number | null = null;

  isNewPatientMode = false;
  selectedPatientAllergyText = '';
  private boxesSelectionInitialized = false;
  private hasUserAdjustedBoxSelection = false;

  private readonly allergyLabelByFlag: Record<number, string> = {
    [AllergyFlag.PENICILLIN]: 'Penicil·lina',
    [AllergyFlag.LATEX]: 'Làtex',
    [AllergyFlag.ANESTHESIA]: 'Anestèsia',
    [AllergyFlag.NSAIDS]: 'AINEs',
  };

  private readonly createSuccessMessagesByCode: Record<string, string> = {
    APPOINTMENT_CREATED: 'Cita creada correctament.',
    APPOINTMENT_CREATED_SUCCESSFULLY: 'Cita creada correctament.',
  };

  private readonly createSuccessMessagesByKey: Record<string, string> = {
    'appointment.created': 'Cita creada correctament.',
    'appointment.create.success': 'Cita creada correctament.',
  };

  private readonly createErrorMessagesByCode: Record<string, string> = {
    APPOINTMENT_VALIDATION_ERROR: 'No s\'ha pogut crear la cita. Revisa les dades del formulari.',
    APPOINTMENT_VALIDATION_FAILED: 'No s\'ha pogut crear la cita. Revisa les dades del formulari.',
    APPOINTMENT_TIME_CONFLICT: 'Ja existeix una cita en aquest horari. Selecciona una altra hora.',
    APPOINTMENT_OVERLAP: 'Ja existeix una cita en aquest horari. Selecciona una altra hora.',
    DOCTOR_OCCUPIED: 'Aquest doctor ja té una cita en aquest horari.',
    PATIENT_NOT_FOUND: 'No s\'ha trobat el pacient seleccionat.',
    DOCTOR_NOT_FOUND: 'No s\'ha trobat el doctor seleccionat.',
    BOX_NOT_FOUND: 'No s\'ha trobat el box seleccionat.',
  };

  private readonly createErrorMessagesByKey: Record<string, string> = {
    'appointment.error.validation': 'No s\'ha pogut crear la cita. Revisa les dades del formulari.',
    'appointment.error.time_conflict': 'Ja existeix una cita en aquest horari. Selecciona una altra hora.',
    'appointment.doctor.occupied': 'Aquest doctor ja té una cita en aquest horari.',
    'appointment.error.patient_not_found': 'No s\'ha trobat el pacient seleccionat.',
    'appointment.error.doctor_not_found': 'No s\'ha trobat el doctor seleccionat.',
    'appointment.error.box_not_found': 'No s\'ha trobat el box seleccionat.',
  };

  private readonly createErrorMessagesByField: Record<string, string> = {
    patient: 'Selecciona un pacient vàlid.',
    doctor: 'Selecciona un doctor vàlid.',
    box: 'Selecciona un box vàlid.',
    visitDate: 'La data de la cita no és vàlida.',
    visitTime: 'L\'hora de la cita no és vàlida.',
    duration: 'La durada de la cita no és vàlida.',
    durationMinutes: 'La durada de la cita no és vàlida.',
    pathology: 'La patologia seleccionada no és vàlida.',
    pathologyId: 'La patologia seleccionada no és vàlida.',
    treatment: 'El tractament seleccionat no és vàlid.',
    treatmentId: 'El tractament seleccionat no és vàlid.',
    consultationReason: 'El motiu de la consulta no és vàlid.',
  };

  newAppointmentData = {
    patient: '',
    newPatientName: '',
    newPatientDni: '',
    doctor: '',
    box: '',
    pathologyId: '',
    treatmentId: '',
    visitDate: new Date().toISOString().split('T')[0],
    visitTime: `${String(this.dayStartHour).padStart(2, '0')}:00`,
    consultationReason: '',
    durationMinutes: 30,
    isFirstVisit: false,
    isUrgency: false
  };

  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly router: Router
  ) {}

  ngOnDestroy(): void {
    this.clearErrorDismissTimer();
  }

  getCreateFieldError(field: string): string | null {
    const aliases: Record<string, string> = {
      visitHour: 'visitTime',
      visitMinute: 'visitTime',
    };
    const key = aliases[field] ?? field;
    return this.createFormFieldErrors()[key] ?? null;
  }

  private clearCreateFormErrors(): void {
    this.createFormError.set(null);
    this.createFormFieldErrors.set({});
  }

  clearCreateFieldError(field: string): void {
    const aliases: Record<string, string> = {
      visitHour: 'visitTime',
      visitMinute: 'visitTime',
    };
    const key = aliases[field] ?? field;
    const current = this.createFormFieldErrors();
    if (!current[key]) {
      return;
    }

    const next = { ...current };
    delete next[key];
    this.createFormFieldErrors.set(next);
  }

  private setCreateFieldError(field: string, message: string): void {
    this.createFormFieldErrors.update((current) => ({
      ...current,
      [field]: message,
    }));
  }

  private clearErrorDismissTimer(): void {
    if (this.errorDismissTimer != null) {
      clearTimeout(this.errorDismissTimer);
      this.errorDismissTimer = null;
    }
  }

  ngOnInit(): void {
    this.refreshWeekDays();
    this.fetchAppointments();
    this.loadPatients();
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  setViewMode(mode: 'day' | 'week'): void {
    if (this.viewMode() === mode) {
      return;
    }

    this.viewMode.set(mode);
    if (mode === 'week') {
      this.fetchWeekAppointments();
    }
  }

  isDayView(): boolean {
    return this.viewMode() === 'day';
  }

  isWeekView(): boolean {
    return this.viewMode() === 'week';
  }

  goToPreviousWeek(): void {
    const base = this.parseYmdToDate(this.newAppointmentData.visitDate);
    const previousWeek = new Date(base);
    previousWeek.setDate(previousWeek.getDate() - 7);
    this.onDateChange(this.formatDateYmd(previousWeek));
  }

  goToNextWeek(): void {
    const base = this.parseYmdToDate(this.newAppointmentData.visitDate);
    const nextWeek = new Date(base);
    nextWeek.setDate(nextWeek.getDate() + 7);
    this.onDateChange(this.formatDateYmd(nextWeek));
  }

  getWeekRangeLabel(): string {
    const days = this.weekDays();
    if (days.length === 0) {
      return '';
    }

    const first = this.parseYmdToDate(days[0].date);
    const last = this.parseYmdToDate(days[days.length - 1].date);
    return `${this.formatDateForHeader(first)} - ${this.formatDateForHeader(last)}`;
  }

  getAppointmentsForWeekDay(date: string): Appointment[] {
    return this.weeklyAppointments()[date] ?? [];
  }

  getAppointmentsForDay(date: string, box: unknown): Appointment[] {
    return this.appointments()
      .filter((appointment) => this.isAppointmentOnDay(appointment, date))
      .filter((appointment) => this.belongsToBox(appointment, box))
      .sort((a, b) => this.parseTimeToMinutes(a.time) - this.parseTimeToMinutes(b.time));
  }

  getVisibleAppointmentsForWeekDay(date: string): Appointment[] {
    const selectedWeekBox = this.getSelectedWeekBox();
    if (!selectedWeekBox) {
      return [];
    }

    const selectedDoctorKey = this.selectedWeekDoctorKey();

    return this.getAppointmentsForWeekDay(date)
      .filter((appointment) => this.belongsToSelectedWeekBox(appointment, selectedWeekBox))
      .filter((appointment) => this.matchesSelectedWeekDoctor(appointment, selectedDoctorKey))
      .sort((a, b) => this.parseTimeToMinutes(a.time) - this.parseTimeToMinutes(b.time));
  }

  getAppointmentsForWeekDayAndBox(date: string, box: unknown): Appointment[] {
    return this.getAppointmentsForWeekDay(date).filter((appointment) => this.belongsToBox(appointment, box));
  }

  getTotalAppointmentsForVisibleBoxes(date: string): number {
    return this.getVisibleAppointmentsForWeekDay(date).length;
  }

  getWeekBoxOptions(): any[] {
    return this.getDisplayBoxes();
  }

  getWeekBoxOptionKey(box: unknown): string {
    return this.getBoxKey(box);
  }

  getWeekDoctorOptions(): Array<{ key: string; label: string }> {
    const options: Array<{ key: string; label: string }> = [{ key: 'all', label: 'Tots els doctors' }];
    const seen = new Set<string>(['all']);

    const pushOption = (key: string, label: string): void => {
      const normalizedKey = String(key ?? '').trim();
      const normalizedLabel = String(label ?? '').trim();
      if (!normalizedKey || !normalizedLabel || seen.has(normalizedKey)) {
        return;
      }

      seen.add(normalizedKey);
      options.push({ key: normalizedKey, label: normalizedLabel });
    };

    this.doctorsList().forEach((doctor) => {
      const key = this.getDoctorKeyFromSource(doctor);
      const label = this.getDoctorLabelFromSource(doctor);
      if (key && label) {
        pushOption(key, label);
      }
    });

    Object.values(this.weeklyAppointments()).forEach((dayRows) => {
      dayRows.forEach((appointment) => {
        const key = this.getAppointmentDoctorFilterKey(appointment);
        const label = this.getAppointmentDoctorLabel(appointment);
        if (key && label) {
          pushOption(key, label);
        }
      });
    });

    return options;
  }

  private getSelectedWeekBox(): unknown | null {
    const options = this.getDisplayBoxes();
    if (options.length === 0) {
      return null;
    }

    const selectedKey = this.selectedWeekBoxKey();
    if (selectedKey) {
      const selected = options.find((box) => this.getWeekBoxOptionKey(box) === selectedKey);
      if (selected) {
        return selected;
      }
    }

    return options[0];
  }

  onWeekBoxSelected(boxKey: string): void {
    const normalizedKey = String(boxKey ?? '').trim();
    if (!normalizedKey) {
      return;
    }
    this.selectedWeekBoxKey.set(normalizedKey);
  }

  onWeekDoctorSelected(doctorKey: string): void {
    const normalizedKey = String(doctorKey ?? '').trim();
    this.selectedWeekDoctorKey.set(normalizedKey || 'all');
  }

  getSelectedWeekBoxLabel(): string {
    const selected = this.getSelectedWeekBox();
    if (!selected) {
      return '';
    }
    return this.getBoxLabel(selected);
  }

  getSelectedWeekDoctorLabel(): string {
    const selected = this.selectedWeekDoctorKey();
    const option = this.getWeekDoctorOptions().find((item) => item.key === selected);
    return option?.label ?? 'Tots els doctors';
  }

  toggleNewPatientMode(): void {
    this.isNewPatientMode = !this.isNewPatientMode;
    
    if (this.isNewPatientMode) {
      this.newAppointmentData.patient = '';
      this.newAppointmentData.isFirstVisit = true;
      this.onFirstVisitChange();
    } else {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30;
    }
  }

  onFirstVisitChange(): void {
    if (this.newAppointmentData.isFirstVisit) {
      this.newAppointmentData.isUrgency = false;
      this.newAppointmentData.durationMinutes = 60;
      this.newAppointmentData.consultationReason = 'Primera visita / Revisió';
    }
  }

  onUrgencyChange(): void {
    if (this.newAppointmentData.isUrgency) {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30;
      this.newAppointmentData.consultationReason = 'Urgència';
    }
  }

  onPatientChange(patientId: any): void {
    this.treatmentsList.set([]);
    this.newAppointmentData.treatmentId = '';
    this.newAppointmentData.pathologyId = '';
    this.selectedTreatment = null;
    this.selectedPatientAllergyText = '';

    if (!patientId) return;

    this.applyFirstVisitDefaultFromPatient(patientId);
    this.setSelectedPatientAllergies(patientId);

    this.appointmentService.getPatientTreatments(patientId).subscribe({
      next: (data) => {
        const list = this.extractList(data);
        this.treatmentsList.set(list);
      },
      error: (err) => console.error('Error en carregar els tractaments', err)
    });
  }

  private applyFirstVisitDefaultFromPatient(patientId: any): void {
    const selectedPatientId = this.toNumberOrNull(patientId);
    if (selectedPatientId == null) {
      return;
    }

    const selectedPatient = this.patientsList().find(
      (patient) => this.toNumberOrNull(patient?.id) === selectedPatientId
    );

    if (!selectedPatient || typeof selectedPatient !== 'object') {
      return;
    }

    const patientRecord = selectedPatient as ApiRecord;
    const lastOdontogramValue = patientRecord['lastOdontogramId'] ?? patientRecord['last_odontogram_id'];
    const hasOdontogram = this.toNumberOrNull(lastOdontogramValue) != null;

    this.newAppointmentData.isFirstVisit = !hasOdontogram;
    if (this.newAppointmentData.isFirstVisit) {
      this.onFirstVisitChange();
      return;
    }

    if (!this.newAppointmentData.isUrgency) {
      this.newAppointmentData.durationMinutes = 30;
      if (this.newAppointmentData.consultationReason === 'Primera visita / Revisió') {
        this.newAppointmentData.consultationReason = '';
      }
    }
  }

  getDayAllergySummary(): DayAllergySummaryItem[] {
    return this.dayAllergySummary();
  }

  getSelectedPatientAllergyText(): string {
    return this.selectedPatientAllergyText;
  }

  hasAppointmentAllergy(appointment: Appointment): boolean {
    const patientRecord = this.findPatientRecordForAppointment(appointment);
    if (!patientRecord) {
      return false;
    }
    return this.extractSelectedAllergyFlags(patientRecord).length > 0;
  }

  private setSelectedPatientAllergies(patientId: any): void {
    const selectedPatientId = this.toNumberOrNull(patientId);
    if (selectedPatientId == null) {
      return;
    }

    const selectedPatient = this.patientsList().find(
      (patient) => this.toNumberOrNull(patient?.id) === selectedPatientId
    );

    if (!selectedPatient || typeof selectedPatient !== 'object') {
      return;
    }

    const allergyText = this.getAllergyTextFromPatient(selectedPatient as ApiRecord);
    this.selectedPatientAllergyText = allergyText;

    if (allergyText && !this.newAppointmentData.treatmentId) {
      this.newAppointmentData.consultationReason = `Al·lèrgies: ${allergyText}`;
    }
  }

  private getAllergyTextFromPatient(patient: ApiRecord): string {
    const selectedAllergies = this.extractSelectedAllergies(patient);
    if (selectedAllergies.length > 0) {
      return selectedAllergies
        .map((flag) => this.allergyLabelByFlag[flag] ?? `Al·lèrgia ${flag}`)
        .join(', ');
    }

    const rawAllergies = pickMedicationAllergiesFromPatientApiPayload(patient);
    return this.sanitizeAllergyItems(parseMedicationAllergiesDbString(rawAllergies)).join(', ');
  }

  private extractSelectedAllergies(patient: ApiRecord): number[] {
    const rawSelected = patient['selectedAllergies'] ?? patient['selected_allergies'];
    if (Array.isArray(rawSelected)) {
      return rawSelected
        .map((item) => this.toNumberOrNull(item))
        .filter((item): item is number => item != null && item > 0);
    }

    const rawBitmask = this.toNumberOrNull(patient['allergiesBitmask'] ?? patient['allergies_bitmask']);
    if (rawBitmask != null && rawBitmask > 0) {
      return selectedAllergiesFromBitmask(rawBitmask);
    }

    return [];
  }

  onTreatmentSelect(tId: any): void {
    const treatmentId = this.toNumberOrNull(tId);
    if (treatmentId == null) {
      this.newAppointmentData.durationMinutes = 30;
      this.newAppointmentData.pathologyId = '';
      this.selectedTreatment = null;
      return;
    }

    const selected = this.treatmentsList().find((t) =>
      this.toNumberOrNull(t.treatmentId ?? t.id) === treatmentId
    );
    
    if (selected) {
      const selectedPathologyId = this.toNumberOrNull(
        selected.pathologyId ?? selected.pathology_id ?? selected.pathologyTypeId
      );
      const selectedDuration = this.toPositiveNumberOrDefault(
        selected.duration ?? selected.durationMinutes ?? selected.duration_minutes,
        30
      );
      const selectedName = String(
        selected.treatmentName ?? selected.treatment_name ?? selected.name ?? 'Tractament'
      );

      this.selectedTreatment = {
        treatmentId,
        pathologyId: selectedPathologyId,
        durationMinutes: selectedDuration,
        treatmentName: selectedName,
      };

      this.newAppointmentData.pathologyId = selectedPathologyId != null ? String(selectedPathologyId) : '';
      this.newAppointmentData.durationMinutes = selectedDuration;
      this.newAppointmentData.consultationReason = `Seguiment: ${selectedName}`;
    }
  }

  fetchAppointments(): void {
    this.clearErrorDismissTimer();
    this.error.set(null);
    this.loading.set(true);

    const rawDate = String(this.newAppointmentData.visitDate ?? '').trim();
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : this.formatDateYmd(this.parseYmdToDate(rawDate));

    this.appointmentService.getAppointments(dateStr).subscribe({
      next: (data) => {
        const normalizedAppointments = this.extractList(data).map((row) => this.normalizeIncomingAppointment(row));
        this.appointments.set(normalizedAppointments);
        this.syncSelectedBoxesWithAvailable(this.getDisplayBoxes());
        this.dayAllergySummary.set(this.buildDayAllergySummary(normalizedAppointments));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('El servidor continua fallant:', err);
        this.error.set('El servidor no accepta el format de data.');
        this.loading.set(false);
      },
    });
  }

  private buildDayAllergySummary(rows: Appointment[]): DayAllergySummaryItem[] {
    const byLabel = new Map<string, { label: string; patientNames: Set<string> }>();

    for (const appointment of rows) {
      const record = appointment as unknown as ApiRecord;
      const allergyLabels = this.extractAllergyLabelsFromAppointmentRecord(record);
      if (allergyLabels.length === 0) {
        continue;
      }

      const patientName = this.normalizePatientName(appointment.patientName);

      for (const label of allergyLabels) {
        const normalizedLabel = label.trim();
        if (!normalizedLabel) {
          continue;
        }

        const existing = byLabel.get(normalizedLabel) ?? {
          label: normalizedLabel,
          patientNames: new Set<string>(),
        };
        existing.patientNames.add(patientName);
        byLabel.set(normalizedLabel, existing);
      }
    }

    return Array.from(byLabel.values())
      .map((entry) => ({
        label: entry.label,
        patientNames: Array.from(entry.patientNames).sort((a, b) => a.localeCompare(b, 'ca')),
        patientCount: entry.patientNames.size,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca'));
  }

  private extractAllergyLabelsFromAppointmentRecord(record: ApiRecord): string[] {
    const fromRoot = this.extractAllergyLabelsFromRecord(record);
    if (fromRoot.length > 0) {
      return fromRoot;
    }

    const patientNode = this.asRecord(record['patient']);
    if (patientNode) {
      const fromPatient = this.extractAllergyLabelsFromRecord(patientNode);
      if (fromPatient.length > 0) {
        return fromPatient;
      }

      const embedded = pickMedicationAllergiesFromPatientApiPayload(patientNode);
      if (embedded.trim()) {
        return this.sanitizeAllergyItems(parseMedicationAllergiesDbString(embedded));
      }
    }

    const patientId = pickAppointmentPatientId(record);
    if (patientId != null) {
      const patientRecord = this.findPatientRecordById(patientId);
      if (patientRecord) {
        const fromLoadedPatient = this.extractAllergyLabelsFromRecord(patientRecord);
        if (fromLoadedPatient.length > 0) {
          return fromLoadedPatient;
        }
      }
    }

    const raw = pickMedicationAllergiesFromPatientApiPayload(record);
    if (raw.trim()) {
      return this.sanitizeAllergyItems(parseMedicationAllergiesDbString(raw));
    }

    return [];
  }

  private extractAllergyLabelsFromRecord(record: ApiRecord): string[] {
    const selectedAllergies = this.extractSelectedAllergyFlags(record);
    if (selectedAllergies.length > 0) {
      return selectedAllergies.map((flag) => this.allergyLabelByFlag[flag] ?? `Al·lèrgia ${flag}`);
    }

    const raw = pickMedicationAllergiesFromPatientApiPayload(record);
    if (raw.trim()) {
      return this.sanitizeAllergyItems(parseMedicationAllergiesDbString(raw));
    }

    return [];
  }

  private extractSelectedAllergyFlags(record: ApiRecord): number[] {
    const rawSelected = record['selectedAllergies'] ?? record['selected_allergies'];
    if (Array.isArray(rawSelected)) {
      return rawSelected
        .map((item) => this.toNumberOrNull(item))
        .filter((item): item is number => item != null && item > 0);
    }

    const bitmask = this.toNumberOrNull(record['allergiesBitmask'] ?? record['allergies_bitmask']);
    if (bitmask != null && bitmask > 0) {
      return selectedAllergiesFromBitmask(bitmask);
    }

    return [];
  }

  private normalizePatientName(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      return 'Paciente';
    }
    return value.trim();
  }

  private findPatientRecordById(patientId: number): ApiRecord | null {
    const found = this.patientsList().find((patient) => this.toNumberOrNull(patient?.id) === patientId);
    if (!found || typeof found !== 'object') {
      return null;
    }
    return found as ApiRecord;
  }

  private findPatientRecordForAppointment(appointment: Appointment): ApiRecord | null {
    const patientId = this.getAppointmentPatientId(appointment);
    if (patientId != null) {
      const byId = this.findPatientRecordById(patientId);
      if (byId) {
        return byId;
      }
    }

    const patientName = String(appointment?.patientName ?? '').trim();
    if (!patientName) {
      return null;
    }

    const inferredPatientId = this.findPatientIdByAppointmentName(patientName);
    if (inferredPatientId == null) {
      return null;
    }

    return this.findPatientRecordById(inferredPatientId);
  }

  loadPatients(afterLoad?: () => void): void {
    this.appointmentService.getPatients().subscribe({
      next: (data) => {
        this.patientsList.set(data);
        this.dayAllergySummary.set(this.buildDayAllergySummary(this.appointments()));
        afterLoad?.();
        },
        error: () => console.error('Error carregant pacients')
    });
  }

  loadSetupData(date?: string): void {
    const dateToFetch = date || this.newAppointmentData.visitDate;

    this.appointmentService.getSetupFormData(dateToFetch).subscribe({
      next: (data) => {
        if (data) {
          this.pathologiesList.set(data.pathologies || []);

          const doctors = data.doctors || [];
          const boxes = data.boxes || [];

          this.doctorsList.set(doctors);
          this.boxesList.set(boxes);
          this.syncSelectedBoxesWithAvailable(boxes);

          const selectedDoctorExists = doctors.some((d: any) => String(d.id) === String(this.newAppointmentData.doctor));
          if (this.newAppointmentData.doctor && !selectedDoctorExists) {
            this.newAppointmentData.doctor = '';
          }

          const selectedBoxExists = boxes.some((b: any) => String(b.id) === String(this.newAppointmentData.box));
          if (this.newAppointmentData.box && !selectedBoxExists) {
            this.newAppointmentData.box = '';
          }
        }
      },
      error: (err) => console.error('Error al cargar infraestructura:', err)
    });
  }

  onDateChange(newDate?: string): void {
    if (newDate) {
      this.newAppointmentData.visitDate = newDate;
    }
    this.refreshWeekDays();
    this.fetchAppointments();
    if (this.isWeekView()) {
      this.fetchWeekAppointments();
    }
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  openNewAppointmentPanel(): void {
    this.clearCreateFormErrors();
    this.showForm.set(true);
    this.isEditMode = false;
    this.editingAppointmentId = null;
    this.isNewPatientMode = false;
    if (!this.newAppointmentData.visitTime) {
      this.newAppointmentData.visitTime = `${String(this.dayStartHour).padStart(2, '0')}:00`;
    }
    this.loadPatients();
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  private openEditAppointmentPanel(appointment: Appointment): void {
    this.clearCreateFormErrors();
    const patientId = this.getAppointmentPatientId(appointment);
    const doctorId = this.getAppointmentDoctorId(appointment);
    const boxId = this.getAppointmentBoxId(appointment);
    const visitDate = this.getAppointmentVisitDate(appointment);
    const visitTime = this.normalizeAppointmentTime(appointment.time);

    this.showForm.set(true);
    this.isEditMode = true;
    this.editingAppointmentId = appointment.id;
    this.isNewPatientMode = false;

    this.newAppointmentData = {
      ...this.newAppointmentData,
      patient: patientId != null ? String(patientId) : '',
      doctor: doctorId != null ? String(doctorId) : '',
      box: boxId != null ? String(boxId) : '',
      visitDate,
      visitTime,
      consultationReason: appointment.reason ?? '',
      durationMinutes: this.toPositiveNumberOrDefault(appointment.duration, 30),
      isFirstVisit: !!appointment.isFirstVisit,
      isUrgency: !!appointment.isUrgency,
      treatmentId: '',
      pathologyId: '',
      newPatientName: '',
      newPatientDni: '',
    };

    this.loadPatients(() => {
      const resolvedPatientId =
        patientId ?? this.findPatientIdByAppointmentName(appointment.patientName);

      if (resolvedPatientId != null) {
        this.newAppointmentData.patient = String(resolvedPatientId);
        this.onPatientChange(resolvedPatientId);
        return;
      }

      this.selectedPatientAllergyText = '';
    });
    this.loadSetupData(visitDate);
  }

  openNewPatientRegister(): void {
    this.closePanel();
    this.router.navigate(['/patient-register'], {
      queryParams: { returnUrl: '/appointments' },
    });
  }

  closePanel(): void {
    this.clearCreateFormErrors();
    this.showForm.set(false);
    this.isNewPatientMode = false;
    this.isEditMode = false;
    this.editingAppointmentId = null;
    this.newAppointmentData = {
      patient: '',
      newPatientName: '',
      newPatientDni: '',
      doctor: '',
      box: '',
      pathologyId: '',
      treatmentId: '',
      visitDate: new Date().toISOString().split('T')[0],
      visitTime: `${String(this.dayStartHour).padStart(2, '0')}:00`,
      consultationReason: '',
      durationMinutes: 30,
      isFirstVisit: false,
      isUrgency: false
    };
  }

  saveAppointment(): void {
    this.clearCreateFormErrors();

    if (this.isEditMode) {
      this.executeSave();
      return;
    }

    if (this.isNewPatientMode && this.newAppointmentData.newPatientName) {
      const newPatient = {
        firstName: this.newAppointmentData.newPatientName,
        identityDocument: this.newAppointmentData.newPatientDni || '00000000X',
        lastName: 'Pendent'
      };

      this.appointmentService.createQuickPatient(newPatient).subscribe({
        next: (patientCreated: any) => {
          this.newAppointmentData.patient = patientCreated.id;
          this.executeSave();
        },
        error: (_err) => alert('No s\'ha pogut crear el pacient nou')
      });
    } else {
      this.executeSave();
    }
  }

  private executeSave(): void {
    const treatmentId = this.toNumberOrNull(this.newAppointmentData.treatmentId);
    const pathologyIdFromForm = this.toNumberOrNull(this.newAppointmentData.pathologyId);
    const pathologyId = pathologyIdFromForm ?? this.selectedTreatment?.pathologyId ?? null;
    const baseDuration = Number(this.newAppointmentData.durationMinutes);
    const normalizedVisitTime = this.getNormalizedVisitTimeForPayload();
    const normalizedVisitDate = this.getNormalizedVisitDateForPayload();
    const patientId = this.toNumberOrNull(this.newAppointmentData.patient);
    const doctorId = this.toNumberOrNull(this.newAppointmentData.doctor);
    const boxId = this.toNumberOrNull(this.newAppointmentData.box);

    if (patientId == null) {
      this.setCreateFieldError('patient', 'Selecciona un pacient vàlid.');
    }
    if (doctorId == null) {
      this.setCreateFieldError('doctor', 'Selecciona un doctor vàlid.');
    }
    if (boxId == null) {
      this.setCreateFieldError('box', 'Selecciona un box vàlid.');
    }

    if (patientId == null || doctorId == null || boxId == null) {
      this.createFormError.set('Revisa els camps marcats del formulari.');
      return;
    }

    if (
      this.hasDoctorCrossBoxConflict(
        doctorId,
        normalizedVisitDate,
        normalizedVisitTime,
        baseDuration,
        boxId,
        this.isEditMode ? this.editingAppointmentId : null,
      )
    ) {
      const conflictMessage = 'Aquest doctor ja té una cita en un altre box a aquesta hora.';
      this.setCreateFieldError('doctor', conflictMessage);
      this.setCreateFieldError('visitTime', conflictMessage);
      this.createFormError.set(conflictMessage);
      return;
    }

    this.newAppointmentData.visitDate = normalizedVisitDate;
    this.newAppointmentData.visitTime = normalizedVisitTime;

    const dataToSend = {
      patient: patientId,
      doctor: doctorId,
      box: boxId,
      visitDate: normalizedVisitDate,
      visitTime: `${normalizedVisitTime}:00`,
      duration: baseDuration,
      consultationReason: this.newAppointmentData.consultationReason || '',
      treatment: treatmentId,
      pathology: pathologyId,
      isFirstVisit: !!this.newAppointmentData.isFirstVisit,
      isUrgency: !!this.newAppointmentData.isUrgency,
    };

    if (this.isEditMode && this.editingAppointmentId != null) {
      this.appointmentService.updateAppointment(this.editingAppointmentId, dataToSend).subscribe({
        next: () => {
          this.closePanel();
          this.fetchAppointments();
          if (this.isWeekView()) {
            this.fetchWeekAppointments();
          }
          alert('Cita actualitzada correctament.');
        },
        error: (err: unknown) => {
          const httpError = err as HttpErrorResponse;
          console.error('Resposta crua del servidor:', httpError?.error);
          if (this.isDoctorOccupiedError(httpError)) {
            const message = this.resolveCreateErrorMessage(httpError);
            this.applyDoctorOccupiedFormError(message);
            return;
          }
          alert(this.resolveCreateErrorMessage(httpError) || 'No s\'ha pogut actualitzar la cita.');
        }
      });
      return;
    }

    this.appointmentService.createAppointment(dataToSend).subscribe({
      next: (res: unknown) => {
        const normalized = this.asRecord(res);
        const allergyItems = this.extractAllergyItemsFromCreateResponse(normalized);
        const successMessage = this.resolveCreateSuccessMessage(normalized);
        this.closePanel();
        this.fetchAppointments();
        if (this.isWeekView()) {
          this.fetchWeekAppointments();
        }

        if (allergyItems.length > 0) {
          const allergyHeader = this.resolveAllergyAlertHeader(normalized);
          const allergyList = allergyItems.map((item) => `- ${item}`).join('\n');
          alert(`${successMessage}\n\n${allergyHeader}\n${allergyList}`);
          return;
        }

        alert(successMessage);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
          console.error('Resposta crua del servidor:', httpError?.error);
        if (this.isDoctorOccupiedError(httpError)) {
          const message = this.resolveCreateErrorMessage(httpError);
          this.applyDoctorOccupiedFormError(message);
          return;
        }
        const fieldError = this.resolveCreateFieldError(httpError);
        if (fieldError) {
          this.setCreateFieldError(fieldError.field, fieldError.message);
          this.createFormError.set(fieldError.message);
          return;
        }

        const message = this.resolveCreateErrorMessage(httpError);
        this.createFormError.set(message);
        alert(message);
      }
    });
  }

  getVisitHour(): string {
    const parsed = this.parseVisitTimeParts(this.newAppointmentData.visitTime);
    return parsed.hour;
  }

  getVisitMinute(): string {
    const parsed = this.parseVisitTimeParts(this.newAppointmentData.visitTime);
    return parsed.minute;
  }

  onVisitHourChange(hour: string): void {
    const normalizedHour = String(hour ?? '').padStart(2, '0');
    const minute = this.getVisitMinute();
    this.newAppointmentData.visitTime = `${normalizedHour}:${minute}`;
    this.clearCreateFieldError('visitTime');
  }

  onVisitMinuteChange(minute: string): void {
    const normalizedMinute = String(minute ?? '').padStart(2, '0');
    const hour = this.getVisitHour();
    this.newAppointmentData.visitTime = `${hour}:${normalizedMinute}`;
    this.clearCreateFieldError('visitTime');
  }

  private parseVisitTimeParts(value: string): { hour: string; minute: string } {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
    const fallbackHour = String(this.dayStartHour).padStart(2, '0');

    if (!match) {
      return { hour: fallbackHour, minute: '00' };
    }

    const hour = String(Math.min(Math.max(Number(match[1]), this.dayStartHour), this.dayEndHour)).padStart(2, '0');
    const minuteNum = Number(match[2]);
    const normalizedMinute = Number.isFinite(minuteNum)
      ? String(Math.min(Math.max(minuteNum - (minuteNum % 5), 0), 55)).padStart(2, '0')
      : '00';

    return { hour, minute: normalizedMinute };
  }

  private getNormalizedVisitTimeForPayload(): string {
    const parsed = this.parseVisitTimeParts(this.newAppointmentData.visitTime);
    return `${parsed.hour}:${parsed.minute}`;
  }

  private getNormalizedVisitDateForPayload(): string {
    const rawDate = String(this.newAppointmentData.visitDate ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return rawDate;
    }
    return this.formatDateYmd(this.parseYmdToDate(rawDate));
  }

  private buildVisitDateTimeForPayload(visitDate: string, visitTime: string): string {
    return `${visitDate}T${visitTime}:00`;
  }

  private resolveCreateSuccessMessage(payload: ApiRecord | null): string {
    if (!payload) {
      return 'Cita creada correctament.';
    }

    const messageKey = this.pickString(payload, ['messageKey']);
    if (messageKey) {
      const byKey = this.createSuccessMessagesByKey[messageKey];
      if (byKey) {
        return byKey;
      }
    }

    const code = this.pickString(payload, ['code'])?.toUpperCase();
    if (code) {
      const byCode = this.createSuccessMessagesByCode[code];
      if (byCode) {
        return byCode;
      }
    }

    return 'Cita creada correctament.';
  }

  private resolveCreateErrorMessage(err: HttpErrorResponse): string {
    if (err.status === 0) {
      return 'No s\'ha pogut connectar amb el servidor en aquest moment. Torna-ho a provar.';
    }

    const payload = this.asRecord(err.error);
    const errorNode = this.asRecord(payload?.['error']);

    const errorMessageKey = this.pickString(errorNode, ['messageKey']);
    if (errorMessageKey) {
      const byNestedKey = this.createErrorMessagesByKey[errorMessageKey];
      if (byNestedKey) {
        return byNestedKey;
      }
    }

    const rootMessageKey = this.pickString(payload, ['messageKey']);
    if (rootMessageKey) {
      const byRootKey = this.createErrorMessagesByKey[rootMessageKey];
      if (byRootKey) {
        return byRootKey;
      }
    }

    const byValidationField = this.resolveCreateFieldValidationMessage(payload, errorNode);
    if (byValidationField) {
      return byValidationField;
    }

    const backendDetailMessage = this.pickString(errorNode, ['message', 'detail', 'description'])
      || this.pickString(payload, ['detail', 'description', 'message']);
    if (backendDetailMessage) {
      return backendDetailMessage;
    }

    const code = this.pickString(payload, ['code'])?.toUpperCase();
    if (code) {
      const byCode = this.createErrorMessagesByCode[code];
      if (byCode) {
        return byCode;
      }
    }

    if (err.status === 400) {
      return 'No s\'ha pogut crear la cita. Revisa les dades del formulari.';
    }
    if (err.status === 404) {
      return 'No s\'ha trobat algun dels recursos de la cita (pacient, doctor o box).';
    }
    if (err.status === 409) {
      return 'Ja existeix una cita en aquest horari. Selecciona una altra hora.';
    }

    return 'No s\'ha pogut crear la cita en aquest moment.';
  }

  private isDoctorOccupiedError(err: HttpErrorResponse): boolean {
    if (err.status !== 409) {
      return false;
    }

    const payload = this.asRecord(err.error);
    const errorNode = this.asRecord(payload?.['error']);
    const code = this.pickString(payload, ['code'])?.toUpperCase();
    const nestedCode = this.pickString(errorNode, ['code'])?.toUpperCase();
    const messageKey =
      this.pickString(errorNode, ['messageKey', 'message_key']) ||
      this.pickString(payload, ['messageKey', 'message_key']);

    return code === 'DOCTOR_OCCUPIED' || nestedCode === 'DOCTOR_OCCUPIED' || messageKey === 'appointment.doctor.occupied';
  }

  private applyDoctorOccupiedFormError(message: string): void {
    this.setCreateFieldError('doctor', message);
    this.setCreateFieldError('visitTime', message);
    this.createFormError.set(message);
  }

  private resolveCreateFieldError(err: HttpErrorResponse): { field: string; message: string } | null {
    const payload = this.asRecord(err.error);
    const errorNode = this.asRecord(payload?.['error']);
    const field = this.extractCreateErrorField(payload, errorNode);
    if (!field) {
      return null;
    }

    const byField = this.createErrorMessagesByField[field] ?? `El camp ${field} no és vàlid.`;
    return { field, message: byField };
  }

  private resolveCreateFieldValidationMessage(payload: ApiRecord | null, errorNode: ApiRecord | null): string | null {
    const field = this.extractCreateErrorField(payload, errorNode);

    if (!field) {
      return null;
    }

    const byField = this.createErrorMessagesByField[field];
    if (byField) {
      return byField;
    }

    return `El camp ${field} no és vàlid.`;
  }

  private extractCreateErrorField(payload: ApiRecord | null, errorNode: ApiRecord | null): string {
    const fromErrorField = this.pickString(errorNode, ['field', 'propertyPath', 'property_path', 'path']);
    const fromViolationField = this.extractViolationField(payload);
    const fromDetailField = this.extractFieldFromDetail(payload);
    return this.normalizeErrorFieldName(fromErrorField || fromViolationField || fromDetailField);
  }

  private extractViolationField(payload: ApiRecord | null): string | null {
    if (!payload) {
      return null;
    }

    const violations = payload['violations'];
    if (!Array.isArray(violations) || violations.length === 0) {
      return null;
    }

    for (const entry of violations) {
      const record = this.asRecord(entry);
      const propertyPath = this.pickString(record, ['propertyPath', 'property_path', 'field', 'path']);
      if (propertyPath) {
        return propertyPath;
      }
    }

    return null;
  }

  private extractFieldFromDetail(payload: ApiRecord | null): string | null {
    const detail = this.pickString(payload, ['detail', 'description', 'message']);
    if (!detail) {
      return null;
    }

    const quoted = detail.match(/property path\s+"([^"]+)"/i);
    if (quoted?.[1]) {
      return quoted[1];
    }

    return null;
  }

  private normalizeErrorFieldName(rawField: string | null): string {
    const raw = String(rawField ?? '').trim();
    if (!raw) {
      return '';
    }

    const simple = raw.includes('.') ? raw.split('.').pop() ?? raw : raw;
    const normalized = simple.replace(/\[\d+\]/g, '').trim();

    const aliases: Record<string, string> = {
      visit_date: 'visitDate',
      date: 'visitDate',
      visit_time: 'visitTime',
      time: 'visitTime',
      doctor_id: 'doctor',
      patient_id: 'patient',
      box_id: 'box',
      pathology_id: 'pathologyId',
      treatment_id: 'treatmentId',
      consultation_reason: 'consultationReason',
      duration_minutes: 'durationMinutes',
    };

    return aliases[normalized] ?? normalized;
  }

  private resolveAllergyAlertHeader(payload: ApiRecord | null): string {
    const alerts = this.extractAlertRecords(payload);
    for (const alertEntry of alerts) {
      const code = this.pickString(alertEntry, ['code'])?.toUpperCase();
      const messageKey = this.pickString(alertEntry, ['messageKey']);
      if (code === 'PATIENT_MEDICATION_ALLERGIES' || messageKey === 'appointment.alerts.patientMedicationAllergies') {
        return 'Atenció: el pacient té al·lèrgies registrades.';
      }
    }
    return 'Atenció: el pacient té al·lèrgies registrades.';
  }

  private extractAllergyItemsFromCreateResponse(payload: ApiRecord | null): string[] {
    const fromAlerts = this.extractAllergyItemsFromAlerts(payload);
    if (fromAlerts.length > 0) {
      return fromAlerts;
    }
    return this.extractAllergyItemsFromSelectedPatient();
  }

  private extractAllergyItemsFromAlerts(payload: ApiRecord | null): string[] {
    const items = new Set<string>();
    const alerts = this.extractAlertRecords(payload);

    for (const alertEntry of alerts) {
      const code = this.pickString(alertEntry, ['code'])?.toUpperCase();
      const messageKey = this.pickString(alertEntry, ['messageKey']);
      const isMedicationAllergyAlert =
        code === 'PATIENT_MEDICATION_ALLERGIES' ||
        messageKey === 'appointment.alerts.patientMedicationAllergies';

      if (!isMedicationAllergyAlert) {
        continue;
      }

      this.collectAllergyItems(alertEntry, items);
      this.collectAllergyItems(alertEntry['details'], items);
    }

    return Array.from(items);
  }

  private extractAllergyItemsFromSelectedPatient(): string[] {
    const selectedPatientId = this.toNumberOrNull(this.newAppointmentData.patient);
    if (selectedPatientId == null) {
      return [];
    }

    const selectedPatient = this.patientsList().find(
      (patient) => this.toNumberOrNull(patient?.id) === selectedPatientId
    );

    if (!selectedPatient || typeof selectedPatient !== 'object') {
      return [];
    }

    const allergyText = this.getAllergyTextFromPatient(selectedPatient as ApiRecord);
    return allergyText
      ? allergyText.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  }

  private extractAlertRecords(payload: ApiRecord | null): ApiRecord[] {
    if (!payload) {
      return [];
    }
    const alertsRaw = payload['alerts'];
    if (!Array.isArray(alertsRaw)) {
      return [];
    }
    return alertsRaw.filter((entry): entry is ApiRecord => !!entry && typeof entry === 'object');
  }

  private collectAllergyItems(value: unknown, bag: Set<string>): void {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      for (const item of this.sanitizeAllergyItems(parseMedicationAllergiesDbString(value))) {
        bag.add(item);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectAllergyItems(item, bag);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    const record = value as ApiRecord;
    const candidateKeys = [
      'allergies',
      'medicationAllergies',
      'medication_allergies',
      'allergySummary',
      'summary',
      'list',
      'items',
    ];

    for (const key of candidateKeys) {
      this.collectAllergyItems(record[key], bag);
    }
  }

  private sanitizeAllergyItems(items: string[]): string[] {
    const ignored = new Set(['CAP CONEGUDA', 'NO KNOWN', 'NO KNOWN ALLERGIES', 'NINGUNA', 'NINGUNA CONOCIDA']);
    const seen = new Set<string>();
    const out: string[] = [];

    for (const item of items) {
      const normalized = item.trim().toLocaleUpperCase('es-ES');
      if (!normalized || ignored.has(normalized) || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  private asRecord(value: unknown): ApiRecord | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as ApiRecord;
  }

  private pickString(source: ApiRecord | null, keys: string[]): string | null {
    if (!source) {
      return null;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private extractList(value: unknown): any[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const member = obj['hydra:member'];
      if (Array.isArray(member)) {
        return member;
      }
      if (Array.isArray(obj['member'])) {
        return obj['member'] as any[];
      }
    }
    return [];
  }

  private toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private toPositiveNumberOrDefault(value: unknown, fallback: number): number {
    const n = this.toNumberOrNull(value);
    if (n != null && n > 0) {
      return n;
    }
    return fallback;
  }

  private normalizeIncomingAppointment(raw: unknown): Appointment {
    const row = this.asRecord(raw) ?? {};
    const fallback = raw as Partial<Appointment>;
    const visitAt = rawAppointmentOccurredAt(row);
    const visitDate = visitAt
      ? this.formatAppointmentDayKey(visitAt)
      : this.normalizeAppointmentDate(
          this.pickString(
            row,
            [
              'visitDate',
              'visit_date',
              'visitDateTime',
              'visit_datetime',
              'appointmentDate',
              'appointment_date',
              'scheduledDate',
              'scheduled_date',
              'scheduledAt',
              'scheduled_at',
              'startDate',
              'start_date',
              'startAt',
              'start_at',
              'date',
            ]
          ) ||
            String(fallback.visitDate ?? '')
        );

    const id = this.toNumberOrNull(row['id'] ?? fallback.id) ?? 0;
    const time =
      this.pickString(row, ['time', 'visitTime', 'visit_time', 'slotTime', 'slot_time']) ??
      String(fallback.time ?? '08:00');
    const duration = this.toPositiveNumberOrDefault(
      row['duration'] ?? row['durationMinutes'] ?? row['duration_minutes'] ?? fallback.duration,
      30
    );
    const cleaningTime = this.toPositiveNumberOrDefault(
      row['cleaningTime'] ?? row['cleaning_time'] ?? row['cleaningMinutes'] ?? fallback.cleaningTime,
      5
    );
    const doctorNode = this.asRecord(row['doctor']);
    const doctorId = this.toNumberOrNull(
      row['doctorId'] ??
        row['doctor_id'] ??
        row['doctorID'] ??
        doctorNode?.['id'] ??
        doctorNode?.['doctorId'] ??
        doctorNode?.['doctor_id'] ??
        (fallback as Appointment & { doctorId?: unknown }).doctorId
    );
    const doctorName = String(
      row['doctorName'] ??
        row['doctor_name'] ??
        doctorNode?.['name'] ??
        doctorNode?.['fullName'] ??
        doctorNode?.['full_name'] ??
        doctorNode?.['firstName'] ??
        doctorNode?.['first_name'] ??
        fallback.doctorName ??
        '—'
    );

    return {
      id,
      time,
      duration,
      cleaningTime,
      totalBlockTime: duration + cleaningTime,
      status: String(row['status'] ?? fallback.status ?? ''),
      patientName: String(row['patientName'] ?? row['patient_name'] ?? fallback.patientName ?? '—'),
      doctorId,
      doctorName,
      boxId: this.toNumberOrNull(row['boxId'] ?? row['box_id'] ?? fallback.boxId),
      box: String(row['box'] ?? row['boxName'] ?? row['box_name'] ?? fallback.box ?? ''),
      reason: String(row['reason'] ?? row['motive'] ?? fallback.reason ?? ''),
      color: String(row['color'] ?? fallback.color ?? '#2b7fff'),
      visitDate: visitDate || undefined,
      isUrgency: Boolean(row['isUrgency'] ?? row['is_urgency'] ?? fallback.isUrgency),
      isFirstVisit: Boolean(row['isFirstVisit'] ?? row['is_first_visit'] ?? fallback.isFirstVisit),
    };
  }

  private fetchWeekAppointments(): void {
    const days = this.weekDays().length > 0 ? this.weekDays() : this.buildWeekDays(this.newAppointmentData.visitDate);
    if (this.weekDays().length === 0) {
      this.weekDays.set(days);
    }

    this.loading.set(true);
    this.appointmentService.getWeeklyAppointments(this.newAppointmentData.visitDate).pipe(
      catchError(() => of([] as Appointment[]))
    ).subscribe({
      next: (result) => {
        const normalizedRows = result.map((row) => this.normalizeIncomingAppointment(row));
        const entries: Record<string, Appointment[]> = {};
        days.forEach((day) => {
          const weekDate = day.date;
          entries[weekDate] = normalizedRows.filter((appointment) => this.getAppointmentVisitDateForWeek(appointment) === weekDate);
        });
        this.weeklyAppointments.set(entries);
        this.syncSelectedWeekDoctorWithAvailableOptions();
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No s\'han pogut carregar les cites de la setmana.');
        this.loading.set(false);
      },
    });
  }

  private refreshWeekDays(): void {
    this.weekDays.set(this.buildWeekDays(this.newAppointmentData.visitDate));
  }

  private buildWeekDays(anchorDate: string): WeekDayItem[] {
    const base = this.parseYmdToDate(anchorDate);
    const monday = this.getWeekStartMonday(base);
    const formatter = new Intl.DateTimeFormat('ca-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });

    return Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + idx);
      return {
        date: this.formatDateYmd(day),
        label: formatter.format(day),
      };
    });
  }

  private getWeekStartMonday(date: Date): Date {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    return start;
  }

  private parseYmdToDate(value: string): Date {
    const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }

  private formatDateYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateForHeader(date: Date): string {
    return new Intl.DateTimeFormat('ca-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private getBoxKey(box: unknown): string {
    const record = this.asRecord(box);
    const boxId = this.toNumberOrNull(record?.['id']);
    if (boxId != null) {
      return `id:${boxId}`;
    }

    const label = this.normalizeBoxLabel(this.getBoxLabel(box));
    if (label) {
      return `label:${label}`;
    }

    return '';
  }

  private syncSelectedBoxesWithAvailable(boxes: unknown[]): void {
    const availableKeys = boxes
      .map((box) => this.getBoxKey(box))
      .filter((key) => !!key);

    if (!this.boxesSelectionInitialized || !this.hasUserAdjustedBoxSelection) {
      this.selectedBoxKeys.set(availableKeys);
      this.boxesSelectionInitialized = true;
      return;
    }

    const selected = new Set(this.selectedBoxKeys());
    const preserved = availableKeys.filter((key) => selected.has(key));
    this.selectedBoxKeys.set(preserved.length > 0 ? preserved : availableKeys);
    if (availableKeys.length === 0) {
      this.selectedWeekBoxKey.set(null);
      return;
    }

    const currentKey = this.selectedWeekBoxKey();
    if (!currentKey || !availableKeys.includes(currentKey)) {
      this.selectedWeekBoxKey.set(availableKeys[0]);
    }
  }

  private syncSelectedWeekDoctorWithAvailableOptions(): void {
    const selected = this.selectedWeekDoctorKey();
    if (selected === 'all') {
      return;
    }

    const hasSelected = this.getWeekDoctorOptions().some((item) => item.key === selected);
    if (!hasSelected) {
      this.selectedWeekDoctorKey.set('all');
    }
  }

  private belongsToSelectedWeekBox(appointment: Appointment, selectedWeekBox: unknown): boolean {
    const boxRecord = this.asRecord(selectedWeekBox);
    const selectedBoxId = this.toNumberOrNull(
      boxRecord?.['id'] ?? boxRecord?.['boxId'] ?? boxRecord?.['box_id'] ?? boxRecord?.['value']
    );

    if (selectedBoxId != null) {
      return this.getAppointmentBoxId(appointment) === selectedBoxId;
    }

    const selectedLabel = this.normalizeBoxLabel(this.getBoxLabel(selectedWeekBox));
    if (!selectedLabel) {
      return false;
    }

    return this.getAppointmentBoxLabelNormalized(appointment) === selectedLabel;
  }

  private matchesSelectedWeekDoctor(appointment: Appointment, selectedDoctorKey: string): boolean {
    if (!selectedDoctorKey || selectedDoctorKey === 'all') {
      return true;
    }

    return this.getAppointmentDoctorFilterKey(appointment) === selectedDoctorKey;
  }

  private getDoctorKeyFromSource(source: unknown): string {
    const row = this.asRecord(source);
    const id = this.toNumberOrNull(
      row?.['id'] ?? row?.['doctorId'] ?? row?.['doctor_id'] ?? row?.['value']
    );
    if (id != null) {
      return `id:${id}`;
    }

    const label = this.getDoctorLabelFromSource(source);
    if (!label) {
      return '';
    }

    return `name:${this.normalizeDoctorFilterLabel(label)}`;
  }

  private getDoctorLabelFromSource(source: unknown): string {
    const row = this.asRecord(source);
    return String(
      row?.['name'] ??
      row?.['doctorName'] ??
      row?.['doctor_name'] ??
      row?.['fullName'] ??
      row?.['full_name'] ??
      row?.['displayName'] ??
      row?.['display_name'] ??
      row?.['firstName'] ??
      row?.['first_name'] ??
      ''
    ).trim();
  }

  private getAppointmentDoctorLabel(appointment: Appointment): string {
    const row = appointment as unknown as ApiRecord;
    const directLabel = this.getDoctorLabelFromSource(appointment);
    if (directLabel) {
      return directLabel;
    }

    const doctorNode = this.asRecord(row['doctor']);
    return this.getDoctorLabelFromSource(doctorNode);
  }

  private getAppointmentDoctorFilterKey(appointment: Appointment): string {
    const doctorId = this.getAppointmentDoctorId(appointment);
    if (doctorId != null) {
      return `id:${doctorId}`;
    }

    const label = this.getAppointmentDoctorLabel(appointment);
    if (!label) {
      return '';
    }

    return `name:${this.normalizeDoctorFilterLabel(label)}`;
  }

  private normalizeDoctorFilterLabel(value: string): string {
    return String(value ?? '')
      .trim()
      .toLocaleUpperCase('ca-ES')
      .replace(/\s+/g, ' ');
  }

  private hasDoctorCrossBoxConflict(
    doctorId: number,
    visitDate: string,
    visitTime: string,
    durationMinutes: number,
    targetBoxId: number,
    excludedAppointmentId: number | null,
  ): boolean {
    const selectedDoctor = this.doctorsList().find((doctor) => {
      const row = this.asRecord(doctor);
      const id = this.toNumberOrNull(row?.['id'] ?? row?.['doctorId'] ?? row?.['doctor_id']);
      return id === doctorId;
    });

    const selectedDoctorLabel = this.normalizeDoctorFilterLabel(this.getDoctorLabelFromSource(selectedDoctor));

    const targetBox = this.boxesList().find((box) => {
      const row = this.asRecord(box);
      const id = this.toNumberOrNull(row?.['id'] ?? row?.['boxId'] ?? row?.['box_id']);
      return id === targetBoxId;
    });
    const targetBoxLabel = this.normalizeBoxLabel(this.getBoxLabel(targetBox));
    const targetStart = this.parseTimeToMinutes(visitTime);
    const targetDuration = this.toPositiveNumberOrDefault(durationMinutes, 30);
    const targetEnd = targetStart + targetDuration;

    return this.appointments().some((appointment) => {
      if (excludedAppointmentId != null && appointment.id === excludedAppointmentId) {
        return false;
      }

      if (this.getAppointmentVisitDate(appointment) !== visitDate) {
        return false;
      }

      const appointmentStart = this.parseTimeToMinutes(appointment.time);
      const appointmentDuration = this.toPositiveNumberOrDefault(appointment.duration, 30);
      const appointmentEnd = appointmentStart + appointmentDuration;
      const overlaps = appointmentStart < targetEnd && appointmentEnd > targetStart;
      if (!overlaps) {
        return false;
      }

      const appointmentDoctorId = this.getAppointmentDoctorId(appointment);
      if (appointmentDoctorId != null) {
        if (appointmentDoctorId !== doctorId) {
          return false;
        }
      } else {
        const appointmentDoctorLabel = this.normalizeDoctorFilterLabel(this.getAppointmentDoctorLabel(appointment));
        if (!selectedDoctorLabel || appointmentDoctorLabel !== selectedDoctorLabel) {
          return false;
        }
      }

      const appointmentBoxId = this.getAppointmentBoxId(appointment);
      if (appointmentBoxId != null) {
        return appointmentBoxId !== targetBoxId;
      }

      const appointmentBoxLabel = this.getAppointmentBoxLabelNormalized(appointment);
      if (appointmentBoxLabel && targetBoxLabel) {
        return appointmentBoxLabel !== targetBoxLabel;
      }

      return true;
    });
  }

  private inferBoxesFromAppointments(rows: Appointment[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    const used = new Set<string>();

    for (const appointment of rows) {
      const boxId = this.getAppointmentBoxId(appointment);
      const label = this.getAppointmentBoxLabelNormalized(appointment);

      const inferred: Record<string, unknown> = {};
      if (boxId != null) {
        inferred['id'] = boxId;
      }
      if (label) {
        inferred['name'] = label;
      }

      const key = this.getBoxKey(inferred);
      if (!key || used.has(key)) {
        continue;
      }

      used.add(key);
      out.push(inferred);
    }

    return out;
  }

  getDisplayBoxes(): any[] {
    const fromSetup = this.boxesList();
    const inferred = this.inferBoxesFromAppointments(this.appointments());

    const merged = [...fromSetup, ...inferred];
    const unique: any[] = [];
    const used = new Set<string>();

    for (const box of merged) {
      const key = this.getBoxKey(box);
      if (!key || used.has(key)) {
        continue;
      }
      used.add(key);
      unique.push(box);
    }

    return unique;
  }

  getVisibleBoxes(): any[] {
    const boxes = this.getDisplayBoxes();
    const selected = new Set(this.selectedBoxKeys());
    if (selected.size === 0) {
      return boxes;
    }

    const filtered = boxes.filter((box) => selected.has(this.getBoxKey(box)));
    return filtered.length > 0 ? filtered : boxes;
  }

  isBoxSelected(box: unknown): boolean {
    const key = this.getBoxKey(box);
    return key ? this.selectedBoxKeys().includes(key) : false;
  }

  toggleBoxSelection(box: unknown, checked: boolean): void {
    const key = this.getBoxKey(box);
    if (!key) {
      return;
    }

    this.hasUserAdjustedBoxSelection = true;
    const selected = new Set(this.selectedBoxKeys());
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.selectedBoxKeys.set(Array.from(selected));
  }

  areAllBoxesSelected(): boolean {
    const boxes = this.getDisplayBoxes();
    if (boxes.length === 0) {
      return false;
    }
    return this.getVisibleBoxes().length === boxes.length;
  }

  toggleAllBoxes(checked: boolean): void {
    const boxes = this.getDisplayBoxes();
    this.hasUserAdjustedBoxSelection = true;
    if (checked) {
      this.selectedBoxKeys.set(
        boxes
          .map((box) => this.getBoxKey(box))
          .filter((key) => !!key)
      );
      return;
    }

    this.selectedBoxKeys.set([]);
  }

  getBoxLabel(box: unknown): string {
    if (!box || typeof box !== 'object') {
      return String(box ?? '').trim();
    }

    const record = box as ApiRecord;
    const label =
      this.pickString(record, ['name', 'boxName', 'label', 'boxLabel', 'box_label', 'box_name', 'code', 'number']) ||
      this.pickString(record, ['displayName', 'display_name']);

    if (label) {
      return this.normalizeBoxLabel(label);
    }

    const id = this.toNumberOrNull(record['id']);
    if (id != null) {
      return `BOX ${id}`;
    }

    return '';
  }

  belongsToBox(appointment: Appointment, box: unknown): boolean {
    const boxRecord = this.asRecord(box);

    const appointmentBoxId = this.getAppointmentBoxId(appointment);
    const boxId = this.toNumberOrNull(
      boxRecord?.['id'] ?? boxRecord?.['boxId'] ?? boxRecord?.['box_id'] ?? boxRecord?.['value']
    );
    
    // Strategy 1: Match by numeric ID
    if (appointmentBoxId != null && boxId != null && appointmentBoxId === boxId) {
      return true;
    }

    // Strategy 2: Match by normalized label
    const appointmentBoxLabel = this.getAppointmentBoxLabelNormalized(appointment);
    const boxLabel = this.normalizeBoxLabel(this.getBoxLabel(box));
    if (appointmentBoxLabel && boxLabel && appointmentBoxLabel === boxLabel) {
      return true;
    }

    // Strategy 3-4: Legacy fallback from backend serialization
    // Backend returns: 'boxId' (number) and 'box' (boxName string)
    const rawAppointment = appointment as unknown as ApiRecord;
    const rawAppointmentBox = rawAppointment['box'];
    const rawAppointmentBoxId = rawAppointment['boxId'] ?? rawAppointment['box_id'];
    const rawBoxName =
      boxRecord?.['name'] ?? boxRecord?.['boxName'] ?? boxRecord?.['label'] ?? boxRecord?.['box_label'];

    if (rawAppointmentBoxId != null && rawBoxName != null) {
      const appIdText = String(rawAppointmentBoxId).trim();
      const boxIdText = String(boxId ?? '').trim();
      if (appIdText && boxIdText && appIdText === boxIdText) {
        return true;
      }
    }

    if (rawAppointmentBox != null && rawBoxName != null) {
      const appBoxText = String(rawAppointmentBox).trim().toUpperCase();
      const boxNameText = String(rawBoxName).trim().toUpperCase();
      if (appBoxText && boxNameText && appBoxText === boxNameText) {
        return true;
      }
    }

    return false;
  }

  private getAppointmentBoxId(appointment: Appointment): number | null {
    const row = appointment as unknown as ApiRecord;

    // First try direct boxId field (most common in backend responses)
    const directId = this.toNumberOrNull(
      row['boxId'] ?? row['box_id'] ?? row['boxID'] ?? (appointment as unknown as { boxId?: unknown }).boxId
    );
    if (directId != null) {
      return directId;
    }

    // Then try box as a number
    const rawBox = row['box'];
    const boxAsNumber = this.toNumberOrNull(rawBox);
    if (boxAsNumber != null) {
      return boxAsNumber;
    }

    // Try nested object
    const boxNode = this.asRecord(rawBox);
    const nestedId = this.toNumberOrNull(
      boxNode?.['id'] ?? boxNode?.['boxId'] ?? boxNode?.['box_id'] ?? boxNode?.['value']
    );
    if (nestedId != null) {
      return nestedId;
    }

    // Try IRI path or trailing digits in string
    if (typeof rawBox === 'string') {
      const iriMatch = rawBox.match(/\/(\d+)\/?$/);
      if (iriMatch) {
        return this.toNumberOrNull(iriMatch[1]);
      }

      const trailingDigits = rawBox.match(/(\d+)\/?$/);
      if (trailingDigits) {
        return this.toNumberOrNull(trailingDigits[1]);
      }
    }

    return null;
  }

  private getAppointmentBoxLabelNormalized(appointment: Appointment): string {
    const row = appointment as unknown as ApiRecord;
    const boxNode = this.asRecord(row['box']);
    if (boxNode) {
      const label = this.getBoxLabel(boxNode);
      return this.normalizeBoxLabel(label);
    }

    // Check direct string/name fields from appointment API response
    const rawLabelCandidate =
      row['box'] ??
      row['boxName'] ??
      row['box_name'] ??
      row['boxLabel'] ??
      row['box_label'] ??
      appointment.box;

    const raw = typeof rawLabelCandidate === 'string' || typeof rawLabelCandidate === 'number'
      ? String(rawLabelCandidate)
      : String(appointment.box ?? '');
    return this.normalizeBoxLabel(raw);
  }

  private normalizeBoxLabel(value: unknown): string {
    const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    const trimmed = raw.trim();
    if (!trimmed) {
      return '';
    }

    const normalized = trimmed.replace(/\s+/g, ' ').toUpperCase();
    const digits = normalized.match(/(\d+)/)?.[1];
    if (digits) {
      return `BOX ${digits}`;
    }

    if (normalized.startsWith('BOX')) {
      return normalized;
    }

    return normalized;
  }

  getAppointmentTopPx(appointment: Appointment): number {
    const startMinutes = this.parseTimeToMinutes(appointment.time);
    return this.minuteToTopPx(startMinutes);
  }

  getAppointmentHeightPx(appointment: Appointment): number {
    const durationMinutes = this.toPositiveNumberOrDefault(appointment.duration, 30);
    const computed = (durationMinutes / 60) * this.hourSlotHeightPx;
    return Math.max(computed - 2, 14);
  }

  getWeekAppointmentLeft(date: string, appointment: Appointment): string {
    const layout = this.getWeekAppointmentLayoutFor(date, appointment);
    return `calc(0.3rem + ((100% - 0.6rem) * ${layout.leftPct} / 100))`;
  }

  getWeekAppointmentWidth(date: string, appointment: Appointment): string {
    const layout = this.getWeekAppointmentLayoutFor(date, appointment);
    return `calc((100% - 0.6rem) * ${layout.widthPct} / 100)`;
  }

  isWeekAppointmentOverlapping(date: string, appointment: Appointment): boolean {
    const layout = this.getWeekAppointmentLayoutFor(date, appointment);
    return layout.widthPct < 99.9;
  }

  private getWeekAppointmentLayoutFor(
    date: string,
    appointment: Appointment
  ): { leftPct: number; widthPct: number } {
    const layoutById = this.buildWeekAppointmentLayoutByDay(date);
    const fallback = { leftPct: 0, widthPct: 100 };
    return layoutById.get(appointment.id) ?? fallback;
  }

  private buildWeekAppointmentLayoutByDay(
    date: string
  ): Map<number, { leftPct: number; widthPct: number }> {
    const rows = this.getVisibleAppointmentsForWeekDay(date).map((appointment) => {
      const start = this.parseTimeToMinutes(appointment.time);
      const duration = this.toPositiveNumberOrDefault(appointment.duration, 30);
      return {
        appointment,
        start,
        end: start + duration,
      };
    });

    rows.sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return a.end - b.end;
    });

    const out = new Map<number, { leftPct: number; widthPct: number }>();
    if (rows.length === 0) {
      return out;
    }

    type ClusterItem = {
      id: number;
      start: number;
      end: number;
      column: number;
    };

    const finalizeCluster = (items: ClusterItem[], columnsUsed: number) => {
      if (items.length === 0 || columnsUsed <= 0) {
        return;
      }
      const gapPct = 2;
      const widthPct = columnsUsed === 1
        ? 100
        : (100 - gapPct * (columnsUsed - 1)) / columnsUsed;

      for (const item of items) {
        const leftPct = item.column * (widthPct + gapPct);
        out.set(item.id, { leftPct, widthPct });
      }
    };

    let clusterItems: ClusterItem[] = [];
    let active: ClusterItem[] = [];
    let columnEnds: number[] = [];

    for (const row of rows) {
      active = active.filter((item) => item.end > row.start);

      if (active.length === 0 && clusterItems.length > 0) {
        finalizeCluster(clusterItems, columnEnds.length);
        clusterItems = [];
        columnEnds = [];
      }

      let column = columnEnds.findIndex((end) => end <= row.start);
      if (column < 0) {
        column = columnEnds.length;
      }
      columnEnds[column] = row.end;

      const item: ClusterItem = {
        id: row.appointment.id,
        start: row.start,
        end: row.end,
        column,
      };

      clusterItems.push(item);
      active.push(item);
    }

    finalizeCluster(clusterItems, columnEnds.length);
    return out;
  }

  getAppointmentEndTopPx(appointment: Appointment): number {
    const startMinutes = this.parseTimeToMinutes(appointment.time);
    const durationMinutes = this.toPositiveNumberOrDefault(appointment.duration, 30);
    return this.minuteToTopPx(startMinutes + durationMinutes);
  }

  getCleaningTopPx(appointment: Appointment): number {
    return this.getAppointmentEndTopPx(appointment) + 1;
  }

  getCleaningHeightPx(appointment: Appointment): number {
    const cleaningDuration = this.toPositiveNumberOrDefault(appointment.cleaningTime, 0);
    const computed = (cleaningDuration / 60) * this.hourSlotHeightPx;
    return Math.max(computed, 6);
  }

  getAppointmentTimeRange(appointment: Appointment): string {
    const startMinutes = this.parseTimeToMinutes(appointment.time);
    const endMinutes = startMinutes + Math.max(appointment.duration, 0);
    return `${this.formatMinutes(startMinutes)} - ${this.formatMinutes(endMinutes)}`;
  }

  getAppointmentDoctorDisplay(appointment: Appointment): string {
    const direct = String(appointment.doctorName ?? '').trim();
    if (direct && direct !== '—') {
      return direct;
    }

    const doctorId = this.getAppointmentDoctorId(appointment);
    if (doctorId != null) {
      const doctor = this.doctorsList().find((item) => {
        const row = this.asRecord(item);
        const id = this.toNumberOrNull(row?.['id'] ?? row?.['doctorId'] ?? row?.['doctor_id']);
        return id === doctorId;
      });

      const fallbackLabel = this.getDoctorLabelFromSource(doctor);
      if (fallbackLabel) {
        return fallbackLabel;
      }
    }

    return 'Sense doctor';
  }

  isCompactAppointmentCard(appointment: Appointment): boolean {
    return this.getAppointmentHeightPx(appointment) <= 86;
  }

  private parseTimeToMinutes(time: string): number {
    if (!time) {
      return this.dayStartHour * 60;
    }

    const match = String(time).match(/(\d{1,2}):(\d{2})/);
    if (!match) {
      return this.dayStartHour * 60;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return this.dayStartHour * 60;
    }

    return hours * 60 + minutes;
  }

  getAppointmentBoxLabel(appointment: Appointment): string {
    return this.normalizeBoxLabel(appointment.box);
  }

  shouldShowPathologyRow(appointment: Appointment): boolean {
    const reason = String(appointment.reason ?? '').trim();
    if (!reason) {
      return false;
    }

    const row = appointment as unknown as ApiRecord;
    const directPathologyId = this.toNumberOrNull(
      row['pathologyId'] ?? row['pathology_id'] ?? row['pathologyTypeId'] ?? row['pathology_type_id']
    );
    if (directPathologyId != null && directPathologyId > 0) {
      return true;
    }

    const directPathology = this.toNumberOrNull(row['pathology']);
    if (directPathology != null && directPathology > 0) {
      return true;
    }

    const pathologyNode = this.asRecord(row['pathology']);
    const nestedPathologyId = this.toNumberOrNull(pathologyNode?.['id'] ?? pathologyNode?.['pathologyId']);
    if (nestedPathologyId != null && nestedPathologyId > 0) {
      return true;
    }

    return false;
  }

  isStatusUpdating(appointmentId: number): boolean {
    return this.statusUpdatingIds().includes(appointmentId);
  }

  getAppointmentStatusDisplay(currentStatus: string): string {
    const status = String(currentStatus ?? '').trim();
    return status || 'Sense estat';
  }

  isStatusSelectableFromCalendar(currentStatus: string): boolean {
    return this.getManualCalendarStatusOption(currentStatus) != null;
  }

  onAppointmentStatusSelected(appointment: Appointment, selectedStatus: string): void {
    const targetStatus = this.getManualCalendarStatusOption(selectedStatus);
    const currentStatus = this.getAppointmentStatusDisplay(appointment.status);

    if (
      this.isStatusUpdating(appointment.id) ||
      targetStatus == null ||
      targetStatus === currentStatus
    ) {
      return;
    }

    this.changeAppointmentStatus(appointment, targetStatus);
  }

  changeAppointmentStatus(appointment: Appointment, nextStatus: string): void {
    if (this.isStatusUpdating(appointment.id)) {
      return;
    }

    this.markStatusUpdating(appointment.id, true);

    this.appointmentService.updateAppointmentStatus(appointment.id, nextStatus).subscribe({
      next: () => {
        this.fetchAppointments();
        if (this.isWeekView()) {
          this.fetchWeekAppointments();
        }
      },
      error: (err: unknown) => {
        const httpErr = err as HttpErrorResponse;
        if (httpErr?.status === 401) {
          alert('Sessió caducada o sense permisos per canviar l\'estat de la cita.');
          return;
        }
        alert('No s\'ha pogut canviar l\'estat de la cita.');
      },
      complete: () => {
        this.markStatusUpdating(appointment.id, false);
      },
    });
  }

  isQuickActionsOpen(appointmentId: number): boolean {
    return this.quickActionsAppointmentId() === appointmentId;
  }

  isCleaningSelectorOpen(appointmentId: number): boolean {
    return this.cleaningSelectorAppointmentId() === appointmentId;
  }

  toggleCleaningSelector(appointmentId: number): void {
    this.cleaningSelectorAppointmentId.set(
      this.cleaningSelectorAppointmentId() === appointmentId ? null : appointmentId
    );
  }

  onCleaningOptionSelected(appointment: Appointment, selectedValue: string): void {
    const minutes = Number(selectedValue);
    if (!Number.isFinite(minutes)) {
      return;
    }
    this.setAppointmentCleaningBuffer(appointment, minutes);
  }

  toggleQuickActions(appointmentId: number): void {
    this.quickActionsAppointmentId.set(
      this.quickActionsAppointmentId() === appointmentId ? null : appointmentId
    );
  }

  onQuickActionSelected(appointment: Appointment, action: string): void {
    if (!action) {
      return;
    }

    if (action === 'editar') {
      this.quickActionsAppointmentId.set(null);
      this.openEditAppointmentPanel(appointment);
      return;
    }

    if (action === 'eliminar') {
      if (!confirm('Segur que vols eliminar aquesta cita?')) {
        return;
      }

      this.appointmentService.deleteAppointment(appointment.id).subscribe({
        next: () => {
          this.quickActionsAppointmentId.set(null);
          this.fetchAppointments();
          if (this.isWeekView()) {
            this.fetchWeekAppointments();
          }
        },
        error: (err: unknown) => {
          const httpErr = err as HttpErrorResponse;
          if (httpErr?.status === 401 || httpErr?.status === 403) {
            alert('Sessió caducada o sense permisos per eliminar la cita.');
            return;
          }
          alert('No s\'ha pogut eliminar la cita.');
        },
      });
      return;
    }

  }

  setAppointmentCleaningBuffer(appointment: Appointment, minutes: number): void {
    const allowedValues = [5, 10, 15];
    if (!allowedValues.includes(minutes)) {
      alert('La neteja del box només pot ser de 5, 10 o 15 minuts.');
      return;
    }

    const currentCleaning = this.toPositiveNumberOrDefault(appointment.cleaningTime, 5);
    if (currentCleaning === minutes) {
      this.cleaningSelectorAppointmentId.set(null);
      return;
    }

    const duration = this.toPositiveNumberOrDefault(appointment.duration, 30);
    const payload = {
      duration,
      durationMinutes: duration,
      cleaningMinutes: minutes,
      cleaningTime: minutes,
      cleaning_time: minutes,
      totalBlockTime: duration + minutes,
    };

    this.appointmentService.updateAppointment(appointment.id, payload).subscribe({
      next: () => {
        this.quickActionsAppointmentId.set(null);
        this.cleaningSelectorAppointmentId.set(null);
        this.fetchAppointments();
        if (this.isWeekView()) {
          this.fetchWeekAppointments();
        }
      },
      error: (err: unknown) => {
        const httpErr = err as HttpErrorResponse;
        if (httpErr?.status === 400) {
          alert('Valor de neteja invàlid. Només es permet 5, 10 o 15 minuts.');
          return;
        }
        if (httpErr?.status === 401 || httpErr?.status === 403) {
          alert('Sessió caducada o sense permisos per actualitzar la neteja.');
          return;
        }
        alert('No s\'ha pogut actualitzar el temps de neteja del box.');
      },
    });
  }

  private markStatusUpdating(appointmentId: number, isUpdating: boolean): void {
    const current = new Set(this.statusUpdatingIds());
    if (isUpdating) {
      current.add(appointmentId);
    } else {
      current.delete(appointmentId);
    }
    this.statusUpdatingIds.set(Array.from(current));
  }

  private normalizeStatusToken(status: string): string {
    return String(status ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]+/g, '');
  }

  private getManualCalendarStatusOption(status: string): string | null {
    const normalized = this.normalizeStatusToken(status);
    const aliases: Record<string, string> = {
      confirmada: 'Confirmada',
      confirmado: 'Confirmada',
      confirmed: 'Confirmada',
      arribada: 'Arribada',
      arribado: 'Arribada',
      arrived: 'Arribada',
      arrival: 'Arribada',
      checkedin: 'Arribada',
      present: 'Arribada',
      cancelada: 'Cancelada',
      cancellada: 'Cancelada',
      cancelled: 'Cancelada',
      canceled: 'Cancelada',
    };
    return aliases[normalized] ?? null;
  }

  private getAppointmentPatientId(appointment: Appointment): number | null {
    const row = appointment as unknown as ApiRecord;
    const direct = this.toNumberOrNull(row['patientId'] ?? row['patient_id']);
    if (direct != null) {
      return direct;
    }

    const rawPatient = row['patient'];
    const asNumber = this.toNumberOrNull(rawPatient);
    if (asNumber != null) {
      return asNumber;
    }

    if (typeof rawPatient === 'string') {
      const iriMatch = rawPatient.match(/\/(\d+)\/?$/);
      if (iriMatch) {
        return this.toNumberOrNull(iriMatch[1]);
      }
    }

    const patientNode = this.asRecord(row['patient']);
    const nestedDirect = this.toNumberOrNull(
      patientNode?.['id'] ?? patientNode?.['patientId'] ?? patientNode?.['patient_id']
    );
    if (nestedDirect != null) {
      return nestedDirect;
    }

    const nestedIri = patientNode?.['@id'];
    if (typeof nestedIri === 'string') {
      const iriMatch = nestedIri.match(/\/(\d+)\/?$/);
      if (iriMatch) {
        return this.toNumberOrNull(iriMatch[1]);
      }
    }

    return null;
  }

  private findPatientIdByAppointmentName(patientName: string): number | null {
    const normalizedTarget = String(patientName ?? '').trim().toLowerCase();
    if (!normalizedTarget) {
      return null;
    }

    const match = this.patientsList().find((patient) => {
      const first = String(patient?.firstName ?? '').trim();
      const last = String(patient?.lastName ?? '').trim();
      const fullName = `${first} ${last}`.trim().toLowerCase();
      return fullName === normalizedTarget;
    });

    return this.toNumberOrNull(match?.id);
  }

  private getAppointmentDoctorId(appointment: Appointment): number | null {
    const row = appointment as unknown as ApiRecord;
    const direct = this.toNumberOrNull(row['doctorId'] ?? row['doctor_id']);
    if (direct != null) {
      return direct;
    }

    const doctorNode = this.asRecord(row['doctor']);
    return this.toNumberOrNull(doctorNode?.['id']);
  }

  private getAppointmentVisitDate(appointment: Appointment): string {
    if (appointment.visitDate) {
      return this.normalizeAppointmentDate(appointment.visitDate) || appointment.visitDate;
    }

    const row = appointment as unknown as ApiRecord;
    const rawDate =
      row['visitDate'] ??
      row['visit_date'] ??
      row['visitDateTime'] ??
      row['visit_datetime'] ??
      row['appointmentDate'] ??
      row['appointment_date'] ??
      row['scheduledDate'] ??
      row['scheduled_date'] ??
      row['scheduledAt'] ??
      row['scheduled_at'] ??
      row['startDate'] ??
      row['start_date'] ??
      row['startAt'] ??
      row['start_at'] ??
      row['date'];

    const occurredAt = rawAppointmentOccurredAt(row);
    if (occurredAt) {
      return this.formatAppointmentDayKey(occurredAt);
    }

    const normalized = this.normalizeAppointmentDate(rawDate);
    if (normalized) {
      return normalized;
    }

    // Some API responses omit the explicit date when the request is already date-scoped.
    return this.getNormalizedVisitDateForPayload();
  }

  private getAppointmentVisitDateForWeek(appointment: Appointment): string {
    const row = appointment as unknown as ApiRecord;
    const occurredAt = rawAppointmentOccurredAt(row);
    if (occurredAt) {
      return this.formatAppointmentDayKey(occurredAt);
    }

    const rawDate =
      row['visitDate'] ??
      row['visit_date'] ??
      row['visitDateTime'] ??
      row['visit_datetime'] ??
      row['appointmentDate'] ??
      row['appointment_date'] ??
      row['scheduledDate'] ??
      row['scheduled_date'] ??
      row['scheduledAt'] ??
      row['scheduled_at'] ??
      row['startDate'] ??
      row['start_date'] ??
      row['startAt'] ??
      row['start_at'] ??
      row['date'] ??
      appointment.visitDate;

    return this.normalizeAppointmentDate(rawDate);
  }

  private isAppointmentOnDay(appointment: Appointment, dayKey: string): boolean {
    return this.getAppointmentVisitDate(appointment) === dayKey;
  }

  private normalizeAppointmentDate(value: unknown): string {
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? this.formatDateYmd(value) : '';
    }

    if (typeof value === 'number') {
      const parsedFromNumber = new Date(value);
      return Number.isFinite(parsedFromNumber.getTime()) ? this.formatDateYmd(parsedFromNumber) : '';
    }

    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const ymdStart = trimmed.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})/);
    if (ymdStart) {
      const year = Number(ymdStart[1]);
      const month = Number(ymdStart[2]);
      const day = Number(ymdStart[3]);
      return this.toValidYmd(year, month, day);
    }

    const dmyStart = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmyStart) {
      const first = Number(dmyStart[1]);
      const second = Number(dmyStart[2]);
      const year = Number(dmyStart[3]);

      // Accept both DD/MM/YYYY and MM/DD/YYYY, choosing by impossible month/day values.
      if (first > 12 && second <= 12) {
        return this.toValidYmd(year, second, first);
      }
      if (second > 12 && first <= 12) {
        return this.toValidYmd(year, first, second);
      }

      // Ambiguous dates default to DD/MM/YYYY for this locale.
      return this.toValidYmd(year, second, first);
    }

    const isoLike = trimmed.match(/^\d{4}-\d{2}-\d{2}[T\s]/);
    if (isoLike) {
      const parsed = new Date(trimmed);
      if (Number.isFinite(parsed.getTime())) {
        return this.formatAppointmentDayKey(parsed);
      }
    }

    return '';
  }

  private formatAppointmentDayKey(date: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private normalizeAppointmentTime(rawTime: unknown): string {
    const match = String(rawTime ?? '').match(/^(\d{1,2}:\d{2})/);
    if (!match) {
      return '';
    }
    return match[1];
  }

  private minuteToTopPx(totalMinutes: number): number {
    const minMinutes = this.dayStartHour * 60;
    const maxMinutes = this.dayEndHour * 60;
    const boundedMinutes = Math.min(Math.max(totalMinutes, minMinutes), maxMinutes);
    return ((boundedMinutes - minMinutes) / 60) * this.hourSlotHeightPx;
  }

  private formatMinutes(totalMinutes: number): string {
    const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private toValidYmd(year: number, month: number, day: number): string {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return '';
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return '';
    }

    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return '';
    }

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  openOdontogram(appointmentId: number): void {
    window.location.href = `/api/appointment/${appointmentId}/open`;
  }

  finishAppointment(appointmentId: number): void {
    if (confirm('Estàs segur que vols finalitzar aquesta cita?')) {
      this.appointmentService.closeAppointment(appointmentId).subscribe({
        next: () => {
          this.fetchAppointments();
          if (this.isWeekView()) {
            this.fetchWeekAppointments();
          }
        },
        error: () => alert('Error en tancar la cita')
      });
    }
  }

  updateAgendaView() {
    this.appointmentService.getAppointments().subscribe({
      next: (data) => {
        const processedAppointments = data.map(app => ({
          ...app,
          duration: Number(app.duration),
          cleaningTime: Number(app.cleaningTime),
          totalBlockTime: Number(app.duration) + Number(app.cleaningTime)
        }));

        this.appointments.set(processedAppointments);
      },
      error: (err) => console.error('Error en refrescar l\'agenda', err)
    });
  }
}
