import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
} from 'rxjs';

import {
  PROFILE_IMAGE_DEFAULT_URL,
  PROFILE_IMAGE_MAX_BYTES_CLIENT,
  PROFILE_IMAGE_MSG,
  PROFILE_IMAGE_TOAST_MS,
  type ProfileImageToastKind,
  mapProfileImageUploadHttpError,
} from '../../constants/profile-image-upload-feedback';
import {
  buildDoctorAgendaRowsForToday,
  buildDoctorAllergyAlertsForToday,
  collectPatientIdsNeedingAllergyFetch,
  computeDoctorDashboardKpis,
  type DoctorAgendaRow,
  type DoctorAgendaStatusPillVariant,
  type DoctorAllergyAlert,
  pickMedicationAllergiesFromPatientApiPayload,
} from '../../models/appointment-api.util';
import { Patient } from '../../models/patient.model';
import { AppointmentService } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { PatientService } from '../../services/patient.service';
import { AppUser, UserService } from '../../services/user.service';

@Component({
  selector: 'app-doctor-panel',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './doctor-panel.html',
  styleUrl: './doctor-panel.css',
})
export class DoctorPanelComponent implements OnInit, OnDestroy {
  readonly defaultAvatarUrl = PROFILE_IMAGE_DEFAULT_URL;
  profileImageUrl = this.defaultAvatarUrl;
  doctorDisplayName = 'Usuario';
  doctorSpecialty = 'Profesional';
  timeGreeting = 'Buenos días';
  timeGreetingIcon = 'wb_sunny';
  private greetingTimer: ReturnType<typeof setInterval> | null = null;

  /** KPIs y agenda desde `AppointmentService.getAppointments()` (citas en Neon vía Symfony). */
  dashboardStatsLoading = true;
  /** `true` si la última carga de citas falló (red / servidor); no confundir con «0 citas». */
  dashboardLoadFailed = false;
  patientsTodayCount = 0;
  pendingClinicalReviewCount = 0;
  patientsTodayDeltaPct: number | null = null;
  /** Citas de hoy con `medication_allergies` (paciente / Neon), enriquecido con `GET /api/patients/{id}` si hace falta. */
  allergyAlerts: DoctorAllergyAlert[] = [];
  /** Citas de hoy para «Agenda de Hoy» (misma carga que KPIs). */
  agendaRows: DoctorAgendaRow[] = [];
  readonly agendaStatusPillClasses: Record<DoctorAgendaStatusPillVariant, string> = {
    green:
      'px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-bold',
    blue: 'px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold',
    yellow:
      'px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs font-bold',
    slate:
      'px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 text-xs font-bold',
  };
  private dashboardStatsSub: Subscription | null = null;

  /** Búsqueda: texto → `?search=`; solo dígitos → `GET /patients/{id}` primero, luego `?search=`. */
  searchQuery = '';
  patientSearchResults: Patient[] = [];
  searchPatientsLoading = false;
  searchDropdownOpen = false;
  private readonly patientSearchInput$ = new Subject<string>();
  private patientSearchSub: Subscription | null = null;

  private jwtPayload: Record<string, unknown> | null = null;

  /** Mismos avisos temporales que `patient-panel` al subir foto de perfil. */
  readonly profileImageToast = signal<{ kind: ProfileImageToastKind; text: string } | null>(null);
  private profileImageToastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly patientService: PatientService,
    private readonly userService: UserService,
    private readonly appointmentService: AppointmentService
  ) {
    this.refreshJwtPayload();
    this.doctorDisplayName = this.getDoctorDisplayNameFromPayload(this.jwtPayload);
    this.loadDoctorProfileImage();
    this.updateTimeGreeting();
  }

  ngOnInit(): void {
    // Keep greeting synced with the device local time.
    this.greetingTimer = setInterval(() => this.updateTimeGreeting(), 60_000);

    this.loadDashboardAppointmentStats();

    this.patientSearchSub = this.patientSearchInput$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        switchMap((raw) => {
          const term = raw.trim();
          if (!term) {
            this.searchPatientsLoading = false;
            return of([] as Patient[]);
          }
          this.searchPatientsLoading = true;
          return this.searchPatients(term).pipe(
            finalize(() => {
              this.searchPatientsLoading = false;
            }),
            catchError(() => of([] as Patient[]))
          );
        })
      )
      .subscribe((patients) => {
        this.patientSearchResults = patients;
      });
  }

  ngOnDestroy(): void {
    this.clearProfileImageToastTimer();
    this.dashboardStatsSub?.unsubscribe();
    this.dashboardStatsSub = null;
    this.patientSearchSub?.unsubscribe();
    this.patientSearchSub = null;
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer);
      this.greetingTimer = null;
    }
  }

  /** Etiqueta "+n%" / "-n%" respecto a ayer; `null` si no hay base de comparación. */
  get patientsTodayDeltaLabel(): string | null {
    const p = this.patientsTodayDeltaPct;
    if (p === null) {
      return null;
    }
    const sign = p > 0 ? '+' : '';
    return `${sign}${p}%`;
  }

  /** Vuelve a pedir citas al backend (misma fuente que agenda y KPIs). */
  retryDashboardStats(): void {
    this.loadDashboardAppointmentStats();
  }

  private loadDashboardAppointmentStats(): void {
    this.dashboardLoadFailed = false;
    this.dashboardStatsLoading = true;
    this.dashboardStatsSub?.unsubscribe();
    this.dashboardStatsSub = this.appointmentService
      .getAppointments()
      .pipe(
        switchMap((rows) => {
          const at = new Date();
          const kpis = computeDoctorDashboardKpis(rows, at);
          const agendaOpts = {
            now: at,
            fallbackDoctorDisplay: this.doctorDisplayName,
          } as const;
          const agendaRows = buildDoctorAgendaRowsForToday(rows, at, agendaOpts);
          const ids = collectPatientIdsNeedingAllergyFetch(rows, at);
          if (ids.length === 0) {
            return of({
              kpis,
              alerts: buildDoctorAllergyAlertsForToday(rows, at, new Map()),
              agendaRows,
            });
          }
          return forkJoin(
            ids.map((id) =>
              this.patientService.getById(id).pipe(
                catchError(() => of(null)),
                map((p) => ({ id, raw: pickMedicationAllergiesFromPatientApiPayload(p) }))
              )
            )
          ).pipe(
            map((pairs) => {
              const m = new Map<number, string>();
              for (const { id, raw } of pairs) {
                if (raw?.trim()) {
                  m.set(id, raw);
                }
              }
              return {
                kpis,
                alerts: buildDoctorAllergyAlertsForToday(rows, at, m),
                agendaRows,
              };
            })
          );
        }),
        finalize(() => {
          this.dashboardStatsLoading = false;
        })
      )
      .subscribe({
        next: ({ kpis, alerts, agendaRows }) => {
          this.dashboardLoadFailed = false;
          this.patientsTodayCount = kpis.patientsTodayCount;
          this.pendingClinicalReviewCount = kpis.pendingClinicalReviewCount;
          this.patientsTodayDeltaPct = kpis.patientsTodayDeltaPct;
          this.allergyAlerts = alerts;
          this.agendaRows = agendaRows;
        },
        error: () => {
          this.dashboardLoadFailed = true;
          this.patientsTodayCount = 0;
          this.pendingClinicalReviewCount = 0;
          this.patientsTodayDeltaPct = null;
          this.allergyAlerts = [];
          this.agendaRows = [];
        },
      });
  }

  onPatientSearchChange(value: string): void {
    this.patientSearchInput$.next(value);
  }

  onPatientSearchFocus(): void {
    this.searchDropdownOpen = true;
  }

  onPatientSearchBlur(): void {
    setTimeout(() => {
      this.searchDropdownOpen = false;
    }, 200);
  }

  onPatientSearchEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') {
      return;
    }
    keyboardEvent.preventDefault();
    const term = this.searchQuery.trim();
    if (!term || this.searchPatientsLoading) {
      return;
    }
    if (this.patientSearchResults.length !== 1) {
      return;
    }
    this.openPatientFromSearch(this.patientSearchResults[0]);
  }

  patientDisplayName(p: Patient): string {
    const fn = p.firstName?.trim() ?? '';
    const ln = p.lastName?.trim() ?? '';
    const name = [fn, ln].filter(Boolean).join(' ').trim();
    if (name) {
      return name;
    }
    return p.id != null ? `Paciente #${p.id}` : 'Paciente';
  }

  openPatientFromSearch(p: Patient): void {
    if (p.id == null) {
      return;
    }
    this.searchQuery = '';
    this.patientSearchResults = [];
    this.searchDropdownOpen = false;
    this.patientSearchInput$.next('');
    void this.router.navigate(['/patient-panel', p.id]);
  }

  /** Abre el expediente si la cita incluye `patient` / `patient_id` en la respuesta de la API. */
  openPatientFromAgendaRow(row: DoctorAgendaRow, event?: Event): void {
    event?.stopPropagation();
    if (row.patientId == null) {
      return;
    }
    void this.router.navigate(['/patient-panel', row.patientId]);
  }

  openPatientFromAllergyAlert(alert: DoctorAllergyAlert, event?: Event): void {
    event?.stopPropagation();
    if (alert.patientId == null) {
      return;
    }
    void this.router.navigate(['/patient-panel', alert.patientId]);
  }

  onProfileFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.invalidType);
      input.value = '';
      return;
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES_CLIENT) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.tooLargeClient);
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.genericError);
      if (input) {
        input.value = '';
      }
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.genericError);
        if (input) {
          input.value = '';
        }
        return;
      }
      this.persistDoctorProfileImage(result);
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  private describeProfessionalRole(roles: string[] | undefined): string {
    const list = roles?.length ? roles : [];
    const primary =
      list.find((r) => /DOCTOR|DENTIST|MEDIC|ODONT/i.test(r)) ??
      list.find((r) => /ADMIN/i.test(r)) ??
      list.find((r) => r !== 'ROLE_USER');
    if (!primary) {
      return 'Profesional';
    }
    if (/ADMIN/i.test(primary)) {
      return 'Profesional';
    }
    return primary
      .replace(/^ROLE_/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private loadDoctorProfileImage(): void {
    const currentUser = this.authService.getCurrentUser();
    const userId = currentUser?.id;
    const fromSession = this.extractProfileImage(currentUser);
    if (fromSession) {
      this.profileImageUrl = fromSession;
    }

    if (!userId || userId < 1) {
      this.loadDoctorProfileImageFromLocalFallback();
      return;
    }

    this.userService.getById(userId).subscribe({
      next: (user) => {
        this.doctorSpecialty = this.describeProfessionalRole(user.roles);
        const fromApi = this.extractProfileImage(user);
        if (fromApi) {
          this.profileImageUrl = fromApi;
          this.saveDoctorProfileImageToLocalFallback(fromApi);
          this.updateSessionUserWithProfileImage(fromApi, user);
          return;
        }
        this.loadDoctorProfileImageFromLocalFallback();
      },
      error: () => {
        this.loadDoctorProfileImageFromLocalFallback();
      },
    });
  }

  private loadDoctorProfileImageFromLocalFallback(): void {
    try {
      const saved = localStorage.getItem(this.getProfileStorageKey());
      if (saved) {
        this.profileImageUrl = saved;
      } else {
        this.profileImageUrl = this.defaultAvatarUrl;
      }
    } catch {
      this.profileImageUrl = this.defaultAvatarUrl;
    }
  }

  /** `true` si la imagen mostrada no es el avatar por defecto (hay foto guardada o en caché). */
  get doctorProfilePhotoRemovable(): boolean {
    return this.profileImageUrl !== this.defaultAvatarUrl;
  }

  onRemoveDoctorProfilePhoto(): void {
    if (!this.doctorProfilePhotoRemovable) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.deleteNothing);
      return;
    }
    const previousUrl = this.profileImageUrl;
    const currentUser = this.authService.getCurrentUser();
    const userId = currentUser?.id;
    if (!userId || userId < 1) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.noUserSession);
      return;
    }

    this.profileImageUrl = this.defaultAvatarUrl;
    this.removeDoctorProfileImageFromLocalFallback();
    this.showProfileImageFeedback('pending', PROFILE_IMAGE_MSG.deleting);

    this.userService.updateProfileImage(userId, null).subscribe({
      next: (updatedUser) => {
        const fromApi = this.extractProfileImage(updatedUser);
        this.profileImageUrl = fromApi ?? this.defaultAvatarUrl;
        if (fromApi) {
          this.saveDoctorProfileImageToLocalFallback(fromApi);
        }
        this.updateSessionUserWithProfileImage(fromApi, updatedUser);
        this.showProfileImageFeedback('success', PROFILE_IMAGE_MSG.deleteSuccess);
      },
      error: (err: unknown) => {
        this.profileImageUrl = previousUrl;
        this.saveDoctorProfileImageToLocalFallback(previousUrl);
        this.showProfileImageFeedback('error', mapProfileImageUploadHttpError(err));
      },
    });
  }

  private persistDoctorProfileImage(profileImageData: string): void {
    const previousUrl = this.profileImageUrl;

    this.profileImageUrl = profileImageData;
    this.saveDoctorProfileImageToLocalFallback(profileImageData);

    const currentUser = this.authService.getCurrentUser();
    const userId = currentUser?.id;
    if (!userId || userId < 1) {
      this.revertDoctorProfileImagePreview(previousUrl);
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.noUserSession);
      return;
    }

    this.clearProfileImageToastTimer();
    this.userService
      .updateProfileImage(userId, profileImageData)
      .subscribe({
        next: (updatedUser) => {
          const savedValue = this.extractProfileImage(updatedUser) ?? profileImageData;
          this.profileImageUrl = savedValue;
          this.saveDoctorProfileImageToLocalFallback(savedValue);
          this.updateSessionUserWithProfileImage(savedValue, updatedUser);
          this.showProfileImageFeedback('success', PROFILE_IMAGE_MSG.success);
        },
        error: (err: unknown) => {
          this.revertDoctorProfileImagePreview(previousUrl);
          this.showProfileImageFeedback('error', mapProfileImageUploadHttpError(err));
        },
      });
  }

  /** Deshace la vista previa y el `localStorage` si el guardado en servidor falla. */
  private revertDoctorProfileImagePreview(previousUrl: string): void {
    this.profileImageUrl = previousUrl;
    this.saveDoctorProfileImageToLocalFallback(previousUrl);
  }

  private showProfileImageFeedback(kind: ProfileImageToastKind, text: string): void {
    this.clearProfileImageToastTimer();
    this.profileImageToast.set({ kind, text });
    if (kind === 'pending') {
      return;
    }
    this.profileImageToastTimer = setTimeout(() => {
      this.profileImageToast.set(null);
      this.profileImageToastTimer = null;
    }, PROFILE_IMAGE_TOAST_MS);
  }

  private clearProfileImageToastTimer(): void {
    if (this.profileImageToastTimer) {
      clearTimeout(this.profileImageToastTimer);
      this.profileImageToastTimer = null;
    }
  }

  private saveDoctorProfileImageToLocalFallback(value: string): void {
    try {
      localStorage.setItem(this.getProfileStorageKey(), value);
    } catch {
      // If storage is full/blocked, keep current image without breaking UI.
    }
  }

  private removeDoctorProfileImageFromLocalFallback(): void {
    try {
      localStorage.removeItem(this.getProfileStorageKey());
    } catch {
      // storage bloqueado: ignorar
    }
  }

  private extractProfileImage(
    user:
      | Partial<AppUser>
      | { profileImageUrl?: string | null }
      | null
      | undefined
  ): string | null {
    if (!user) {
      return null;
    }
    const value = user.profileImageUrl;
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private updateSessionUserWithProfileImage(
    imageValue: string | null | undefined,
    source?: Partial<AppUser>
  ): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    const v = (imageValue && imageValue.trim()) || '';
    const merged = {
      ...currentUser,
      email: source?.email ?? currentUser.email,
      roles: source?.roles ?? currentUser.roles,
      fullName: source?.fullName ?? currentUser.fullName,
      profileImageUrl: v,
      profile_image_url: v,
      profile_image: v,
    };
    this.authService.setCurrentUser(merged);
  }

  private getProfileStorageKey(): string {
    const doctorIdentifier = this.getDoctorIdentifierFromPayload(this.jwtPayload);
    return `falconcare_doctor_profile_image_${doctorIdentifier}`;
  }

  private getDoctorIdentifierFromPayload(payload: Record<string, unknown> | null): string {
    if (!payload) {
      return 'anonymous';
    }

    const identifier = payload?.['email'] ?? payload?.['username'] ?? payload?.['sub'];
    if (!identifier || typeof identifier !== 'string') {
      return 'anonymous';
    }

    return identifier.toLowerCase().trim();
  }

  private refreshJwtPayload(): void {
    this.jwtPayload = this.parseJwtPayload(this.authService.getToken() ?? '');
  }

  private getDoctorDisplayNameFromPayload(payload: Record<string, unknown> | null): string {
    if (!payload) {
      return 'Usuario';
    }

    const fullName =
      this.getStringValue(payload, ['name', 'fullName', 'full_name', 'displayName', 'display_name']) ??
      this.buildNameFromParts(payload);
    if (fullName) {
      return fullName;
    }

    const emailOrSub = this.getStringValue(payload, ['email', 'sub', 'username', 'preferred_username']);
    if (!emailOrSub) {
      return 'Usuario';
    }

    const emailPrefix = emailOrSub.includes('@') ? emailOrSub.split('@')[0] : emailOrSub;
    return this.toDisplayCase(emailPrefix.replace(/[._-]+/g, ' ').trim()) || 'Usuario';
  }

  private buildNameFromParts(payload: Record<string, unknown>): string | null {
    const firstName = this.getStringValue(payload, ['given_name', 'firstName', 'first_name']);
    const lastName = this.getStringValue(payload, ['family_name', 'lastName', 'last_name']);
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    return combined ? this.toDisplayCase(combined) : null;
  }

  private getStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private toDisplayCase(value: string): string {
    return value
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private updateTimeGreeting(): void {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      this.timeGreeting = 'Buenos días';
      this.timeGreetingIcon = 'wb_sunny';
      return;
    }
    if (hour >= 12 && hour < 20) {
      this.timeGreeting = 'Buenas tardes';
      this.timeGreetingIcon = 'wb_sunny';
      return;
    }
    this.timeGreeting = 'Buenas noches';
    this.timeGreetingIcon = 'bedtime';
  }

  private parseJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const normalizedBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalizedBase64);
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Búsqueda robusta:
   * 1) por ID (si aplica),
   * 2) por endpoint `?search=`,
   * 3) fallback a listado completo + filtro local (nombre/id).
   */
  private searchPatients(term: string): Observable<Patient[]> {
    const idNum = /^\d+$/.test(term) ? Number(term) : NaN;
    const validId = Number.isFinite(idNum) && idNum >= 1;

    const byId$ = validId
      ? this.patientService.getById(idNum).pipe(
          map((p) => [p] as Patient[]),
          catchError(() => of([] as Patient[]))
        )
      : of([] as Patient[]);

    const bySearch$ = this.patientService.list(term).pipe(catchError(() => of([] as Patient[])));
    const byLocalFallback$ = this.patientService
      .list()
      .pipe(
        map((patients) => this.filterPatientsLocally(patients, term)),
        catchError(() => of([] as Patient[]))
      );

    if (validId) {
      return byId$.pipe(
        switchMap((byId) =>
          bySearch$.pipe(
            switchMap((bySearch) => {
              const merged = this.mergeUniquePatients(byId, bySearch);
              return merged.length > 0
                ? of(merged)
                : byLocalFallback$.pipe(map((local) => this.mergeUniquePatients(byId, local)));
            })
          )
        )
      );
    }

    return bySearch$.pipe(
      switchMap((bySearch) =>
        bySearch.length > 0 ? of(bySearch) : byLocalFallback$
      )
    );
  }

  private filterPatientsLocally(patients: Patient[], term: string): Patient[] {
    const normalizedTerm = this.normalizeText(term);
    if (!normalizedTerm) {
      return [];
    }
    return patients.filter((p) => {
      const idText = String(p.id ?? '');
      const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
      const normalizedName = this.normalizeText(fullName);
      return idText.includes(term) || normalizedName.includes(normalizedTerm);
    });
  }

  private mergeUniquePatients(...groups: Patient[][]): Patient[] {
    const seen = new Set<number>();
    const merged: Patient[] = [];
    for (const group of groups) {
      for (const patient of group) {
        const id = patient.id;
        if (id == null || seen.has(id)) {
          continue;
        }
        seen.add(id);
        merged.push(patient);
      }
    }
    return merged;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
