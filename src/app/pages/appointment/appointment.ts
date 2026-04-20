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
  statusUpdatingIds = signal<number[]>([]);
  readonly appointmentStatusOptions: string[] = [
    'Programada',
    'Confirmada',
    'En curs',
    'Cancel·lada',
    'Finalitzada',
    'Falta Consentiment',
  ];
  quickActionsAppointmentId = signal<number | null>(null);
  cleaningSelectorAppointmentId = signal<number | null>(null);
  pathologiesList = signal<any[]>([]);
  treatmentsList = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
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
    PATIENT_NOT_FOUND: 'No s\'ha trobat el pacient seleccionat.',
    DOCTOR_NOT_FOUND: 'No s\'ha trobat el doctor seleccionat.',
    BOX_NOT_FOUND: 'No s\'ha trobat el box seleccionat.',
  };

  private readonly createErrorMessagesByKey: Record<string, string> = {
    'appointment.error.validation': 'No s\'ha pogut crear la cita. Revisa les dades del formulari.',
    'appointment.error.time_conflict': 'Ja existeix una cita en aquest horari. Selecciona una altra hora.',
    'appointment.error.patient_not_found': 'No s\'ha trobat el pacient seleccionat.',
    'appointment.error.doctor_not_found': 'No s\'ha trobat el doctor seleccionat.',
    'appointment.error.box_not_found': 'No s\'ha trobat el box seleccionat.',
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
    visitTime: '',
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

  getVisibleAppointmentsForWeekDay(date: string): Appointment[] {
    const visibleBoxes = this.getVisibleBoxes();
    return this.getAppointmentsForWeekDay(date)
      .filter((appointment) => visibleBoxes.some((box) => this.belongsToBox(appointment, box)))
      .sort((a, b) => this.parseTimeToMinutes(a.time) - this.parseTimeToMinutes(b.time));
  }

  getAppointmentsForWeekDayAndBox(date: string, box: unknown): Appointment[] {
    return this.getAppointmentsForWeekDay(date).filter((appointment) => this.belongsToBox(appointment, box));
  }

  getTotalAppointmentsForVisibleBoxes(date: string): number {
    const visibleBoxes = this.getVisibleBoxes();
    const appointments = this.getAppointmentsForWeekDay(date);
    return appointments.filter((appointment) => visibleBoxes.some((box) => this.belongsToBox(appointment, box))).length;
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
        console.log('Tratamientos recibidos de la API:', data);
        const list = this.extractList(data);
        this.treatmentsList.set(list);
      },
      error: (err) => console.error('Error al cargar tratamientos', err)
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

    console.log('Enviando fecha limpia al servidor:', dateStr);

    this.appointmentService.getAppointments(dateStr).subscribe({
      next: (data) => {
        const normalizedAppointments = this.extractList(data).map((row) => this.normalizeIncomingAppointment(row));

        console.log('¡Éxito! Citas recibidas:', normalizedAppointments);
        console.log(`  → ${normalizedAppointments.length} citas cargadas`);
        
        // Debug: Mostrar información de cada cita
        normalizedAppointments.forEach((cita, idx) => {
          const boxInfo = this.getAppointmentBoxId(cita) || this.getAppointmentBoxLabelNormalized(cita);
          console.log(`    [${idx}] Cita: ${cita.patientName || '?'} → Box: ${boxInfo}`);
        });
        
        this.appointments.set(normalizedAppointments);
        
        // Debug: Mostrar boxes disponibles
        const displayBoxes = this.getDisplayBoxes();
        console.log(`Display boxes después de cargar citas: ${displayBoxes.length}`);
        displayBoxes.forEach((box, idx) => {
          console.log(`    [${idx}] Box: ${this.getBoxLabel(box)} (ID: ${this.toNumberOrNull(box?.id)})`);
        });
        
        // Debug: Mostrar boxes visibles
        const visibleBoxes = this.getVisibleBoxes();
        console.log(`Visible boxes (after filter): ${visibleBoxes.length}`);
        
        this.syncSelectedBoxesWithAvailable(displayBoxes);
        this.dayAllergySummary.set(this.buildDayAllergySummary(normalizedAppointments));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('El servidor sigue fallando:', err);
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

  loadPatients(afterLoad?: () => void): void {
    this.appointmentService.getPatients().subscribe({
      next: (data) => {
        console.log('Pacients rebuts:', data);
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
        console.log('--- REVISIÓN DE DATOS ---');
        console.log('Objeto completo recibido:', data);
        
        if (data) {
          if (data.doctors) {
            console.log(`  → ${data.doctors.length} doctores cargados`);
            console.table(data.doctors);
          }
          if (data.boxes) {
            console.log(`  → ${data.boxes.length} boxes cargados`);
            data.boxes.forEach((box: any, idx: number) => {
              console.log(`    [${idx}] ${box.name || box.label || box.id} (ID: ${box.id})`);
            });
            console.table(data.boxes);
          }
          this.pathologiesList.set(data.pathologies || []);

          const doctors = data.doctors || [];
          const boxes = data.boxes || [];

          this.doctorsList.set(doctors);
          this.boxesList.set(boxes);
          this.syncSelectedBoxesWithAvailable(boxes);

          // Debug: Mostrar merged display boxes
          const displayBoxes = this.getDisplayBoxes();
          console.log(`Display boxes después de setup: ${displayBoxes.length}`);

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

  // onDateChange(): void {
  //   console.log('Nueva fecha detectada:', this.newAppointmentData.visitDate);
  //   this.newAppointmentData.doctor = ''; 
  //   this.loadSetupData(this.newAppointmentData.visitDate);
  // }

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
    this.showForm.set(true);
    this.isEditMode = false;
    this.editingAppointmentId = null;
    this.isNewPatientMode = false;
    this.loadPatients();
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  private openEditAppointmentPanel(appointment: Appointment): void {
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
      visitTime: '',
      consultationReason: '',
      durationMinutes: 30,
      isFirstVisit: false,
      isUrgency: false
    };
  }

  saveAppointment(): void {
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
        error: (_err) => alert('Error en crear el pacient nou')
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
    const cleaningBuffer = BOX_CLEANING_BUFFER_MINUTES;

    const dataToSend = {
      patient: Number(this.newAppointmentData.patient),
      doctor: Number(this.newAppointmentData.doctor),
      box: Number(this.newAppointmentData.box),
      visitDate: this.newAppointmentData.visitDate,
      visitTime: this.newAppointmentData.visitTime,
      
      // Visible appointment span remains `duration`; cleaning is persisted separately.
      duration: baseDuration,
      durationMinutes: baseDuration,
      cleaningTime: cleaningBuffer,
      cleaning_time: cleaningBuffer,
      cleaningMinutes: cleaningBuffer,
      totalBlockTime: baseDuration + cleaningBuffer,
      
      consultationReason: this.newAppointmentData.consultationReason || '',
      
      treatment: treatmentId,
      treatmentId,
      pathology: pathologyId,
      pathologyId,
      
      isFirstVisit: !!this.newAppointmentData.isFirstVisit,
      isUrgency: !!this.newAppointmentData.isUrgency
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
          console.error('Respuesta cruda del servidor:', httpError?.error);
          alert('No s\'ha pogut actualitzar la cita.');
        }
      });
      return;
    }

    this.appointmentService.createAppointment(dataToSend).subscribe({
      next: (res: unknown) => {
        const normalized = this.asRecord(res);
        const allergyItems = this.extractAllergyItemsFromCreateResponse(normalized);
        const successMessage = this.resolveCreateSuccessMessage(normalized);

        console.log('ID recibido:', normalized?.['id']);
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
        console.error('Respuesta cruda del servidor:', httpError?.error);
        alert(this.resolveCreateErrorMessage(httpError));
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
  }

  onVisitMinuteChange(minute: string): void {
    const normalizedMinute = String(minute ?? '').padStart(2, '0');
    const hour = this.getVisitHour();
    this.newAppointmentData.visitTime = `${hour}:${normalizedMinute}`;
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
    const visitDate = this.normalizeAppointmentDate(
      this.pickString(row, ['visitDate', 'visit_date', 'appointmentDate', 'appointment_date', 'scheduledDate', 'scheduled_date', 'startDate', 'start_date', 'date']) ||
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

    return {
      id,
      time,
      duration,
      cleaningTime,
      totalBlockTime: duration + cleaningTime,
      status: String(row['status'] ?? fallback.status ?? 'Programada'),
      patientName: String(row['patientName'] ?? row['patient_name'] ?? fallback.patientName ?? '—'),
      doctorName: String(row['doctorName'] ?? row['doctor_name'] ?? fallback.doctorName ?? '—'),
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
          entries[weekDate] = normalizedRows.filter((appointment) => this.getAppointmentVisitDate(appointment) === weekDate);
        });
        this.weeklyAppointments.set(entries);
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
    
    // Debug logging - uncomment to see what's being compared
    // console.log(`[belongsToBox] Checking if appt box ${appointmentBoxId}/${this.getAppointmentBoxLabelNormalized(appointment)} belongs to box ${boxId}/${this.normalizeBoxLabel(this.getBoxLabel(box))}`);
    
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

  getStatusSelectValue(currentStatus: string): string {
    const normalized = this.normalizeStatusToken(currentStatus);
    if (normalized === 'programada' || normalized === 'programado' || normalized === 'scheduled') {
      return 'Programada';
    }
    if (normalized === 'confirmada' || normalized === 'confirmado' || normalized === 'confirmed') {
      return 'Confirmada';
    }
    if (normalized === 'encurs' || normalized === 'encurso' || normalized === 'inprogress') {
      return 'En curs';
    }
    if (
      normalized === 'cancelada' ||
      normalized === 'cancel.lada' ||
      normalized === 'cancel·lada' ||
      normalized === 'cancelled' ||
      normalized === 'canceled'
    ) {
      return 'Cancel·lada';
    }
    if (normalized === 'finalitzada' || normalized === 'finalizada' || normalized === 'finished') {
      return 'Finalitzada';
    }
    if (normalized === 'faltaconsentiment' || normalized === 'faltaconsentimiento') {
      return 'Falta Consentiment';
    }
    return 'Programada';
  }

  onAppointmentStatusSelected(appointment: Appointment, selectedStatus: string): void {
    const targetStatus = this.getStatusSelectValue(selectedStatus);
    const currentStatus = this.getStatusSelectValue(appointment.status);

    if (this.isStatusUpdating(appointment.id) || !targetStatus || targetStatus === currentStatus) {
      return;
    }

    this.changeAppointmentStatus(appointment, targetStatus);
  }

  changeAppointmentStatus(appointment: Appointment, nextStatus: string): void {
    if (this.isStatusUpdating(appointment.id)) {
      return;
    }

    const normalizedNextStatus = this.getStatusSelectValue(nextStatus);
    this.markStatusUpdating(appointment.id, true);

    this.appointmentService.updateAppointmentStatus(appointment.id, normalizedNextStatus).subscribe({
      next: () => {
        this.fetchAppointments();
        if (this.isWeekView()) {
          this.fetchWeekAppointments();
        }
      },
      error: (err: unknown) => {
        const httpErr = err as HttpErrorResponse;
        if (httpErr?.status === 401) {
          alert('Sessio caducada o sense permisos per canviar l\'estat de la cita.');
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
            alert('Sessio caducada o sense permisos per eliminar la cita.');
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
      alert('La neteja del box nomes pot ser de 5, 10 o 15 minuts.');
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
          alert('Valor de neteja invalid. Nomes es permet 5, 10 o 15 minuts.');
          return;
        }
        if (httpErr?.status === 401 || httpErr?.status === 403) {
          alert('Sessio caducada o sense permisos per actualitzar la neteja.');
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
    const row = appointment as unknown as ApiRecord;
    const rawDate = row['visitDate'] ?? row['visit_date'] ?? row['appointmentDate'] ?? row['appointment_date'] ?? row['scheduledDate'] ?? row['scheduled_date'] ?? row['date'];
    return this.normalizeAppointmentDate(rawDate) || this.newAppointmentData.visitDate;
  }

  private normalizeAppointmentDate(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }

    return '';
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
        error: () => alert('Error al tancar la cita')
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
        
        console.log("Agenda actualizada con tiempos de bloqueo");
      },
      error: (err) => console.error("Error al refrescar agenda", err)
    });
  }

  // PUBLIC DEBUG FUNCTION - Call from console as: window.appointmentDebug()
  debugAppointmentRendering(): void {
    console.log('========== DEBUGGING APPOINTMENT RENDERING ==========');
    
    const citas = this.appointments();
    const boxes = this.getDisplayBoxes();
    const visibleBoxes = this.getVisibleBoxes();
    const selectedKeys = this.selectedBoxKeys();
    
    console.log(`\n📋 CITAS (${citas.length} total):`);
    citas.forEach((cita, idx) => {
      const boxId = this.getAppointmentBoxId(cita);
      const boxLabel = this.getAppointmentBoxLabelNormalized(cita);
      const rawData = cita as unknown as ApiRecord;
      console.log(`  [${idx}] ${cita.patientName}`);
      console.log(`       → boxId: ${boxId}, boxLabel: "${boxLabel}"`);
      console.log(`       → raw box: "${rawData['box']}", raw boxId: "${rawData['boxId']}"`);
    });
    
    console.log(`\n📦 BOXES (${boxes.length} total, ${visibleBoxes.length} visible):`);
    boxes.forEach((box, idx) => {
      const key = this.getBoxKey(box);
      const isSelected = selectedKeys.includes(key);
      const label = this.getBoxLabel(box);
      const id = this.toNumberOrNull(box?.id);
      console.log(`  [${idx}] ${label} (ID: ${id})`);
      console.log(`       → Key: "${key}", Selected: ${isSelected}`);
    });
    
    console.log(`\n🔗 MATCHING TEST:`);
    if (citas.length > 0 && boxes.length > 0) {
      const testCita = citas[0];
      const testBox = boxes[0];
      const matches = this.belongsToBox(testCita, testBox);
      console.log(`  Testing first cita with first box: ${matches ? '✓ MATCH' : '✗ NO MATCH'}`);
      console.log(`    Cita: ${testCita.patientName} (box: ${this.getAppointmentBoxLabelNormalized(testCita)})`);
      console.log(`    Box: ${this.getBoxLabel(testBox)} (name: ${testBox?.name})`);
    }
    
    console.log('\n======================================================');
  }
}