import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Subject,
  Subscription,
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  finalize,
  from,
  map,
  of,
  switchMap,
  take,
  toArray,
} from 'rxjs';

import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import {
  PROFILE_IMAGE_DEFAULT_URL,
  PROFILE_IMAGE_MAX_BYTES_CLIENT,
  PROFILE_IMAGE_MSG,
  type ProfileImageToastKind,
  mapProfileImageUploadHttpError,
} from '../../constants/profile-image-upload-feedback';
import {
  documentTypeForUpload,
  mapUnknownToPatientDocumentView,
  type PatientDocumentView,
} from '../../models/document-api.util';
import {
  formatVisitDateLabel,
  parseMedicationAllergiesDbString,
  rawAppointmentToVisitEntry,
  sortVisitHistoryEntries,
} from '../../models/appointment-api.util';
import { Patient } from '../../models/patient.model';
import type { PatientVisitHistoryEntry } from '../../models/patient-visit-history.model';
import {
  belongsToPatientRelation,
  belongsToPatientRelationStrict,
} from '../../models/patient-relation.util';
import { normalizePatientProfileImage } from '../../models/patient-profile.util';
import { AppointmentService } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { DocumentService } from '../../services/document.service';
import { PatientService } from '../../services/patient.service';

/** Límite alineado con la UI; el backend puede imponer otro máximo. */
const PATIENT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

@Component({
  selector: 'app-patient-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './patient-panel.html',
  styleUrl: './patient-panel.css',
})
export class PatientPanelComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patientService = inject(PatientService);
  private readonly appointmentService = inject(AppointmentService);
  private readonly documentService = inject(DocumentService);
  private readonly auth = inject(AuthService);

  /** Misma imagen por defecto que el doctor: logotipo en `branding`. */
  readonly defaultPatientAvatarUrl = PROFILE_IMAGE_DEFAULT_URL;

  readonly patient = signal<Patient | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  /** Foto de perfil del paciente (fuente principal: API/Neon en `profile_image`). */
  readonly profileImageUrl = signal(this.defaultPatientAvatarUrl);

  /** Edición de datos de contacto (persistido vía API → Neon). */
  readonly contactEditMode = signal(false);
  readonly contactSaving = signal(false);
  readonly contactFeedbackError = signal<string | null>(null);
  readonly contactFeedbackOk = signal<string | null>(null);
  draftPhone = '';
  draftEmail = '';
  draftAddress = '';
  readonly conditionsSaving = signal(false);
  readonly conditionsFeedbackError = signal<string | null>(null);
  readonly conditionsFeedbackOk = signal<string | null>(null);
  draftHealthStatus = '';
  draftLifestyleHabits = '';
  private conditionsDirty = false;
  private readonly conditionsInput$ = new Subject<string>();
  private conditionsSub: Subscription | null = null;
  private visitHistorySub: Subscription | null = null;
  private patientDocumentsSub: Subscription | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  /** Tras ocultar la pestaña, al volver se refresca el historial (citas nuevas en Neon / API). */
  private visitHistoryTabWasHidden = false;
  private readonly visibilityChangeListener = (): void => {
    if (document.visibilityState === 'hidden') {
      this.visitHistoryTabWasHidden = true;
      return;
    }
    if (!this.visitHistoryTabWasHidden) {
      return;
    }
    this.visitHistoryTabWasHidden = false;
    const id = this.patient()?.id;
    if (id == null) {
      return;
    }
    if (!this.visitHistoryLoading()) {
      this.loadVisitHistory(id);
    }
    this.loadPatientDocuments(id);
  };

  /** Alergias críticas: se persisten en `medication_allergies` (lista separada por comas, en MAYÚSCULAS). */
  readonly allergyAdding = signal(false);
  readonly allergySaving = signal(false);
  readonly allergyFeedbackOk = signal<string | null>(null);
  readonly allergyFeedbackError = signal<string | null>(null);
  newAllergyText = '';
  /** Historial de visitas (`appointment` en BD), alineado con la API. */
  readonly visitHistory = signal<PatientVisitHistoryEntry[]>([]);
  readonly visitHistoryLoading = signal(false);
  readonly visitHistoryError = signal<string | null>(null);

  /** Documentos clínicos (`documents` en BD), filtrados por paciente actual. */
  readonly patientDocuments = signal<PatientDocumentView[]>([]);
  readonly patientDocumentsLoading = signal(false);
  readonly patientDocumentsError = signal<string | null>(null);
  readonly patientDocumentsUploading = signal(false);
  /** Subida / zona de drop desactivadas (sin paciente o subida en curso). */
  readonly patientDocumentsZoneLocked = computed(
    () => this.patient()?.id == null || this.patientDocumentsUploading()
  );
  readonly patientFileFeedback = signal<{ kind: 'success' | 'error'; text: string } | null>(null);
  private patientFileFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  /** Aviso temporal (éxito/error) al subir foto; misma lógica y textos que `doctor-panel` (vista previa + reversión si falla el guardado). */
  readonly profileImageToast = signal<{ kind: ProfileImageToastKind; text: string } | null>(null);
  private profileImageToastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Evita que `syncPatientFromApi` pise la vista previa mientras el PUT está en curso. */
  private profileImageUploadPending = false;

  private allergyFeedbackDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private contactFeedbackDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private conditionsFeedbackDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private visitHistoryErrorDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private patientDocumentsErrorDismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.conditionsSub = this.conditionsInput$
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        switchMap(() => this.persistConditionsIfNeeded())
      )
      .subscribe();

    this.syncTimer = setInterval(() => {
      this.syncPatientFromApi();
    }, 20_000);

    document.addEventListener('visibilitychange', this.visibilityChangeListener);

    this.route.paramMap
      .pipe(
        map((params) => params.get('patientId')),
        switchMap((idStr) => {
          this.visitHistorySub?.unsubscribe();
          this.visitHistorySub = null;
          this.patientDocumentsSub?.unsubscribe();
          this.patientDocumentsSub = null;
          this.clearBlockFeedbackDismissTimers();

          this.patient.set(null);
          this.visitHistory.set([]);
          this.visitHistoryError.set(null);
          this.visitHistoryLoading.set(false);
          this.patientDocuments.set([]);
          this.patientDocumentsError.set(null);
          this.patientDocumentsLoading.set(false);
          this.clearPatientFileFeedbackTimer();
          this.patientFileFeedback.set(null);
          if (!idStr) {
            this.loading.set(false);
            this.loadError.set('Falta el identificador del paciente en la URL.');
            return EMPTY;
          }
          const id = Number(idStr);
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set('El identificador del paciente no es válido.');
            return EMPTY;
          }
          this.loading.set(true);
          this.loadError.set(null);
          return this.patientService.getById(id).pipe(
            map((raw) => this.adaptPatient(raw as unknown)),
            catchError((err: unknown) => {
              this.loadError.set(this.describePatientLoadError(err, id));
              return EMPTY;
            }),
            finalize(() => this.loading.set(false))
          );
        })
      )
      .subscribe((p) => {
        if (p) {
          this.patient.set(p);
          this.clearProfileImageToast();
          this.applyPatientProfileImage(p);
          this.resetContactDraftFromPatient();
          this.contactEditMode.set(false);
          this.contactFeedbackError.set(null);
          this.contactFeedbackOk.set(null);
          this.conditionsFeedbackError.set(null);
          this.conditionsFeedbackOk.set(null);
          this.allergyFeedbackError.set(null);
          this.allergyFeedbackOk.set(null);
          this.allergyAdding.set(false);
          this.newAllergyText = '';
          this.resetConditionsDraftFromPatient();
          this.conditionsDirty = false;
          this.loadVisitHistory(p.id);
          this.loadPatientDocuments(p.id);
        }
      });
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityChangeListener);
    this.visitHistorySub?.unsubscribe();
    this.visitHistorySub = null;
    this.patientDocumentsSub?.unsubscribe();
    this.patientDocumentsSub = null;
    this.clearPatientFileFeedbackTimer();
    this.clearProfileImageToastTimer();
    this.clearBlockFeedbackDismissTimers();
    this.conditionsSub?.unsubscribe();
    this.conditionsSub = null;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /** Lista para la UI: misma regla que alertas del doctor-panel y columna `medication_allergies` (Neon). */
  getAllergyItems(): string[] {
    return parseMedicationAllergiesDbString(this.patient()?.medicationAllergies ?? '');
  }

  toggleAllergyInput(): void {
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackError.set(null);
    this.contactFeedbackOk.set(null);
    this.clearAllergyFeedbackDismissTimer();
    this.allergyFeedbackError.set(null);
    this.allergyFeedbackOk.set(null);
    if (this.allergyAdding()) {
      this.allergyAdding.set(false);
      this.newAllergyText = '';
    } else {
      this.allergyAdding.set(true);
      this.newAllergyText = '';
    }
  }

  submitNewAllergy(): void {
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackError.set(null);
    this.contactFeedbackOk.set(null);
    const label = this.toAllergyLabel(this.newAllergyText);
    if (!label) {
      this.allergyFeedbackOk.set(null);
      this.allergyFeedbackError.set('Escribe el nombre de la alergia.');
      this.scheduleAllergyFeedbackAutoHide();
      return;
    }
    const existing = this.getAllergyItems();
    if (existing.includes(label)) {
      this.allergyFeedbackOk.set(null);
      this.allergyFeedbackError.set('Esta alergia ya está registrada.');
      this.scheduleAllergyFeedbackAutoHide();
      return;
    }
    this.persistAllergies([...existing, label]);
  }

  removeAllergy(index: number): void {
    const items = [...this.getAllergyItems()];
    if (index < 0 || index >= items.length) {
      return;
    }
    items.splice(index, 1);
    this.persistAllergies(items);
  }

  private persistAllergies(items: string[]): void {
    const p = this.patient();
    if (!p?.id) {
      return;
    }
    const medicationAllergies = this.allergiesToStorageString(items);
    this.allergySaving.set(true);
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackError.set(null);
    this.contactFeedbackOk.set(null);
    this.clearAllergyFeedbackDismissTimer();
    this.allergyFeedbackError.set(null);
    this.allergyFeedbackOk.set(null);
    this.patientService.update(p.id, { medicationAllergies }).subscribe({
      next: (raw) => {
        this.patient.set(this.adaptPatient(raw as unknown));
        this.newAllergyText = '';
        this.allergyAdding.set(false);
        this.allergyFeedbackOk.set('Las alergias críticas se han actualizado correctamente.');
        this.scheduleAllergyFeedbackAutoHide();
        this.allergySaving.set(false);
      },
      error: (err: unknown) => {
        const http = err as HttpErrorResponse;
        if (http?.status === 400) {
          this.allergyFeedbackError.set('No se pudieron guardar las alergias. Revisa los datos.');
        } else if (http?.status === 0) {
          this.allergyFeedbackError.set('No se pudo conectar con el servidor.');
        } else if (http?.status === 401 || http?.status === 403) {
          this.allergyFeedbackError.set('No tienes permiso para actualizar este paciente.');
        } else {
          this.allergyFeedbackError.set('No se pudieron guardar las alergias. Inténtalo de nuevo.');
        }
        this.scheduleAllergyFeedbackAutoHide();
        this.allergySaving.set(false);
      },
    });
  }

  private allergiesToStorageString(items: string[]): string {
    if (items.length === 0) {
      return 'Sin información inicial';
    }
    return items.map((i) => this.toAllergyLabel(i)).join(', ');
  }

  private toAllergyLabel(value: string): string {
    return value.trim().toLocaleUpperCase('es-ES');
  }

  toggleContactEdit(): void {
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackError.set(null);
    this.contactFeedbackOk.set(null);
    if (this.contactEditMode()) {
      this.resetContactDraftFromPatient();
      this.contactEditMode.set(false);
    } else {
      this.resetContactDraftFromPatient();
      this.contactEditMode.set(true);
    }
  }

  onConfirmContact(): void {
    this.clearAllergyFeedbackDismissTimer();
    this.allergyFeedbackError.set(null);
    this.allergyFeedbackOk.set(null);
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackError.set(null);
    this.contactFeedbackOk.set(null);

    if (!this.contactEditMode()) {
      this.contactFeedbackError.set('Pulsa «Editar» para modificar los datos de contacto.');
      this.scheduleContactFeedbackAutoHide();
      return;
    }

    const p = this.patient();
    if (!p?.id) {
      return;
    }

    const phoneErr = this.getDraftPhoneError();
    const emailErr = this.getDraftEmailError();
    const addressErr = this.getDraftAddressError();
    if (phoneErr || emailErr || addressErr) {
      this.contactFeedbackError.set(phoneErr ?? emailErr ?? addressErr ?? 'Revisa los datos de contacto.');
      this.scheduleContactFeedbackAutoHide();
      return;
    }

    const phone = this.normalizePhone(this.draftPhone);
    const email = this.draftEmail.trim();
    const address = this.draftAddress.trim() || 'N/A';

    this.contactSaving.set(true);
    this.patientService.update(p.id, { phone, email, address }).subscribe({
      next: (raw) => {
        const updated = this.adaptPatient(raw as unknown);
        this.patient.set(updated);
        this.resetContactDraftFromPatient();
        this.contactEditMode.set(false);
        this.contactFeedbackOk.set(
          'Los datos de contacto del paciente se han guardado correctamente.'
        );
        this.scheduleContactFeedbackAutoHide();
        this.contactSaving.set(false);
      },
      error: (err: unknown) => {
        const http = err as HttpErrorResponse;
        if (http?.status === 400) {
          this.contactFeedbackError.set('No se pudieron guardar los datos. Revisa el formato o inténtalo de nuevo.');
        } else if (http?.status === 0) {
          this.contactFeedbackError.set('No se pudo conectar con el servidor.');
        } else if (http?.status === 401 || http?.status === 403) {
          this.contactFeedbackError.set('No tienes permiso para actualizar este paciente.');
        } else {
          this.contactFeedbackError.set('No se pudieron guardar los datos. Inténtalo de nuevo.');
        }
        this.scheduleContactFeedbackAutoHide();
        this.contactSaving.set(false);
      },
    });
  }

  private resetContactDraftFromPatient(): void {
    const p = this.patient();
    if (!p) {
      return;
    }
    this.draftPhone = p.phone ?? '';
    this.draftEmail = p.email ?? '';
    this.draftAddress = p.address ?? '';
  }

  onConditionsInputChange(): void {
    this.clearConditionsFeedbackDismissTimer();
    this.conditionsFeedbackError.set(null);
    this.conditionsFeedbackOk.set(null);
    this.conditionsDirty = true;
    this.conditionsInput$.next(`${this.draftHealthStatus}|${this.draftLifestyleHabits}`);
  }

  onConditionsBlur(): void {
    this.conditionsInput$.next(`${this.draftHealthStatus}|${this.draftLifestyleHabits}|blur`);
  }

  private persistConditionsIfNeeded() {
    const p = this.patient();
    if (!p?.id) {
      return of(null);
    }

    const healthStatus = this.draftHealthStatus.trim() || 'Sin información inicial';
    const lifestyleHabits = this.draftLifestyleHabits.trim() || 'Sin información inicial';
    const noChanges =
      (p.healthStatus ?? '').trim() === healthStatus &&
      (p.lifestyleHabits ?? '').trim() === lifestyleHabits;
    if (noChanges) {
      this.conditionsDirty = false;
      return of(null);
    }

    this.conditionsSaving.set(true);
    return this.patientService.update(p.id, { healthStatus, lifestyleHabits }).pipe(
      map((raw) => this.adaptPatient(raw as unknown)),
      map((updated) => {
        this.patient.set(updated);
        this.resetConditionsDraftFromPatient();
        this.conditionsDirty = false;
        this.conditionsFeedbackOk.set('Estado de salud y hábitos guardados automáticamente.');
        this.scheduleConditionsFeedbackAutoHide();
        return updated;
      }),
      catchError((err: unknown) => {
        const http = err as HttpErrorResponse;
        if (http?.status === 0) {
          this.conditionsFeedbackError.set('No se pudo conectar con el servidor para guardar cambios.');
        } else if (http?.status === 401 || http?.status === 403) {
          this.conditionsFeedbackError.set('No tienes permiso para actualizar estos campos.');
        } else {
          this.conditionsFeedbackError.set('No se pudieron guardar los cambios en este bloque.');
        }
        this.scheduleConditionsFeedbackAutoHide();
        return of(null);
      }),
      finalize(() => this.conditionsSaving.set(false))
    );
  }

  private resetConditionsDraftFromPatient(): void {
    const p = this.patient();
    if (!p) {
      return;
    }
    this.draftHealthStatus = p.healthStatus ?? '';
    this.draftLifestyleHabits = p.lifestyleHabits ?? '';
  }

  private syncPatientFromApi(): void {
    const p = this.patient();
    if (!p?.id || this.conditionsSaving() || this.conditionsDirty || this.profileImageUploadPending) {
      return;
    }
    this.patientService.getById(p.id).subscribe({
      next: (raw) => {
        const fresh = this.adaptPatient(raw as unknown);
        this.patient.set(fresh);
        this.applyPatientProfileImage(fresh);
        this.resetConditionsDraftFromPatient();
      },
      error: () => {
        // Sincronización silenciosa: evita ruido de UI por fallos temporales.
      },
    });
  }

  private normalizePhone(value: string): string {
    const v = value.trim();
    const startsWithPlus = v.startsWith('+');
    const withoutSeparators = v.replace(/[\s\-().]/g, '');
    if (!startsWithPlus) {
      return withoutSeparators.replace(/\+/g, '');
    }
    return '+' + withoutSeparators.replace(/\+/g, '');
  }

  private getDraftPhoneError(): string | null {
    const normalized = this.normalizePhone(this.draftPhone);
    if (!normalized) {
      return 'El teléfono es obligatorio.';
    }
    const re = /^\+?\d{7,15}$/;
    if (re.test(normalized)) {
      return null;
    }
    return 'Formato de teléfono inválido. Usa un número internacional válido (7-15 dígitos), por ejemplo: +1 212 555 0199';
  }

  private getDraftEmailError(): string | null {
    const v = this.draftEmail.trim();
    if (!v) {
      return 'El correo electrónico es obligatorio.';
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (re.test(v)) {
      return null;
    }
    return 'Correo electrónico inválido.';
  }

  private getDraftAddressError(): string | null {
    const v = this.draftAddress.trim();
    if (!v || v === 'N/A') {
      return null;
    }
    if (!v.includes(',') || (v.match(/,/g)?.length ?? 0) < 2) {
      return 'Dirección con formato inválido. Usa “Calle, número, ciudad”.';
    }
    return null;
  }

  /** `true` si la imagen no es el avatar por defecto (hay `profile_image` en BD o vista previa). */
  patientProfilePhotoRemovable(): boolean {
    return this.profileImageUrl() !== this.defaultPatientAvatarUrl;
  }

  onRemovePatientProfilePhoto(): void {
    const patientId = this.verifiedPatientIdForRoute();
    if (patientId == null) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.noPatientContext);
      return;
    }
    if (!this.patientProfilePhotoRemovable()) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.deleteNothing);
      return;
    }
    const previousUrl = this.profileImageUrl();
    this.profileImageUrl.set(this.defaultPatientAvatarUrl);
    this.showProfileImageFeedback('pending', PROFILE_IMAGE_MSG.deleting);
    this.profileImageUploadPending = true;
    this.patientService
      .update(patientId, { profileImage: null })
      .pipe(finalize(() => (this.profileImageUploadPending = false)))
      .subscribe({
        next: (raw) => {
          const updated = this.adaptPatient(raw as unknown);
          this.patient.set(updated);
          this.applyPatientProfileImage(updated);
          this.showProfileImageFeedback('success', PROFILE_IMAGE_MSG.deleteSuccess);
        },
        error: (err: unknown) => {
          this.profileImageUrl.set(previousUrl);
          this.showProfileImageFeedback('error', mapProfileImageUploadHttpError(err));
        },
      });
  }

  onPatientProfileFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const patientId = this.verifiedPatientIdForRoute();

    if (patientId == null) {
      if (input) {
        input.value = '';
      }
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.noPatientContext);
      return;
    }

    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.invalidType);
      if (input) {
        input.value = '';
      }
      return;
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES_CLIENT) {
      this.showProfileImageFeedback('error', PROFILE_IMAGE_MSG.tooLargeClient);
      if (input) {
        input.value = '';
      }
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
      this.persistPatientProfileImage(patientId, result);
      if (input) {
        input.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  /** Misma secuencia que `DoctorPanelComponent.persistDoctorProfileImage`: vista previa optimista y reversión si el guardado falla. */
  private persistPatientProfileImage(patientId: number, profileImageData: string): void {
    const previousUrl = this.profileImageUrl();

    this.profileImageUrl.set(profileImageData);

    this.clearProfileImageToastTimer();
    this.profileImageUploadPending = true;
    this.patientService
      .update(patientId, { profileImage: profileImageData })
      .pipe(finalize(() => (this.profileImageUploadPending = false)))
      .subscribe({
        next: (raw) => {
          const updated = this.adaptPatient(raw as unknown);
          this.patient.set(updated);
          this.applyPatientProfileImage(updated);
          this.showProfileImageFeedback('success', PROFILE_IMAGE_MSG.success);
        },
        error: (err: unknown) => {
          this.revertPatientProfileImagePreview(previousUrl);
          this.showProfileImageFeedback('error', mapProfileImageUploadHttpError(err));
        },
      });
  }

  private revertPatientProfileImagePreview(previousUrl: string): void {
    this.profileImageUrl.set(previousUrl);
  }

  /** Normaliza camelCase / snake_case del API Symfony. */
  private adaptPatient(raw: unknown): Patient {
    const r = raw as Record<string, unknown>;
    const id = Number(r['id'] ?? r['patient_id'] ?? 0);
    return {
      id,
      identityDocument: String(r['identityDocument'] ?? r['identity_document'] ?? ''),
      firstName: String(r['firstName'] ?? r['first_name'] ?? ''),
      lastName: String(r['lastName'] ?? r['last_name'] ?? ''),
      phone: String(r['phone'] ?? ''),
      email: String(r['email'] ?? ''),
      address: String(r['address'] ?? ''),
      consultationReason: String(r['consultationReason'] ?? r['consultation_reason'] ?? ''),
      familyHistory: String(r['familyHistory'] ?? r['family_history'] ?? ''),
      healthStatus: String(r['healthStatus'] ?? r['health_status'] ?? ''),
      lifestyleHabits: String(r['lifestyleHabits'] ?? r['lifestyle_habits'] ?? ''),
      medicationAllergies: String(
        r['medicationAllergies'] ?? r['medication_allergies'] ?? ''
      ),
      profileImage: normalizePatientProfileImage(r),
    };
  }

  private applyPatientProfileImage(patient: Patient): void {
    const image = this.toNullableString(patient.profileImage);
    this.profileImageUrl.set(image ?? this.defaultPatientAvatarUrl);
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearProfileImageToast(): void {
    this.clearProfileImageToastTimer();
    this.profileImageToast.set(null);
  }

  private clearProfileImageToastTimer(): void {
    if (this.profileImageToastTimer) {
      clearTimeout(this.profileImageToastTimer);
      this.profileImageToastTimer = null;
    }
  }

  /**
   * Query para `/appointments`: `patientId` de la ruta; `firstVisit=1` si no hay visitas en historial, `0` si ya hay.
   */
  scheduleFirstVisitQueryParams(p: Patient): Record<string, string | number> {
    const hasVisits = this.visitHistory().length > 0;
    return {
      patientId: p.id,
      firstVisit: hasVisits ? '0' : '1',
    };
  }

  /** Etiqueta del CTA ámbar: primera visita vs cita adicional. */
  agendarVisitaCtaLabel(): string {
    return this.visitHistory().length === 0 ? 'Agendar Primera Visita' : 'Agendar visita';
  }

  /** El CTA se muestra en cuanto sabemos el estado del historial (no durante la carga inicial). */
  showAgendarVisitaCta(): boolean {
    return !this.visitHistoryLoading();
  }

  displayName(p: Patient): string {
    const fn = p.firstName?.trim() ?? '';
    const ln = p.lastName?.trim() ?? '';
    const joined = [fn, ln].filter(Boolean).join(' ');
    return joined || 'Paciente';
  }

  onBackToDoctorPanel(): void {
    this.router.navigate(['/doctor-panel']);
  }

  onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  /** Etiqueta de fecha para la línea de tiempo (locale es-ES). */
  visitDateLabel(entry: PatientVisitHistoryEntry): string {
    return formatVisitDateLabel(entry.occurredAt);
  }

  /**
   * Botón «Ver Todo el Historial»: vuelve a pedir las citas al API para este paciente
   * y centra el bloque (datos actuales al volver de otra pantalla o tras nuevas citas).
   */
  onVisitHistoryRefresh(): void {
    const id = this.patient()?.id;
    if (id != null) {
      this.loadVisitHistory(id);
      this.loadPatientDocuments(id);
    }
    requestAnimationFrame(() => {
      document.getElementById('patient-visit-history-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  /** Carga citas del paciente actual (`GET /api/appointments?patientId=…`). */
  private loadVisitHistory(patientId: number): void {
    this.visitHistorySub?.unsubscribe();
    this.visitHistoryLoading.set(true);
    this.clearVisitHistoryErrorDismissTimer();
    this.visitHistoryError.set(null);
    this.visitHistorySub = this.appointmentService.listByPatientId(patientId).subscribe({
      next: (rawList) => {
        if (!this.isCurrentPatient(patientId)) {
          return;
        }
        const filtered = rawList.filter((row) => belongsToPatientRelation(row, patientId));
        const entries: PatientVisitHistoryEntry[] = [];
        for (const row of filtered) {
          const e = rawAppointmentToVisitEntry(row);
          if (e) {
            entries.push(e);
          }
        }
        this.visitHistory.set(sortVisitHistoryEntries(entries));
        this.clearVisitHistoryErrorDismissTimer();
        this.visitHistoryError.set(null);
        this.visitHistoryLoading.set(false);
      },
      error: (err: unknown) => {
        if (!this.isCurrentPatient(patientId)) {
          return;
        }
        const http = err as HttpErrorResponse;
        if (http?.status === 401) {
          this.visitHistoryError.set('Sesión caducada o no válida. Vuelve a iniciar sesión.');
        } else if (http?.status === 403) {
          this.visitHistoryError.set(
            'No tienes permiso para ver estas citas (comprueba rol o asignación como doctor).'
          );
        } else if (http?.status === 400) {
          this.visitHistoryError.set(
            'La petición de citas no es válida. Revisa la configuración del API (filtro patientId).'
          );
        } else if (http?.status === 0) {
          this.visitHistoryError.set('No se pudo conectar con el servidor para cargar las visitas.');
        } else if (http?.status != null && http.status >= 500) {
          this.visitHistoryError.set('El servidor devolvió un error al cargar el historial de citas.');
        } else {
          this.visitHistoryError.set('No se pudo cargar el historial de visitas.');
        }
        this.scheduleVisitHistoryErrorAutoHide();
        this.visitHistory.set([]);
        this.visitHistoryLoading.set(false);
      },
    });
  }

  private isCurrentPatient(patientId: number): boolean {
    return this.patient()?.id === patientId;
  }

  /**
   * ID del expediente en pantalla solo si coincide con `:patientId` de la ruta (escrituras Neon: documentos, foto, etc.).
   */
  private verifiedPatientIdForRoute(): number | null {
    const raw = this.route.snapshot.paramMap.get('patientId');
    const routeId = raw ? Number(raw) : NaN;
    const current = this.patient();
    if (!current?.id || !Number.isFinite(routeId) || routeId < 1 || current.id !== routeId) {
      return null;
    }
    return current.id;
  }

  /** `GET /api/documents?patientId=…` (o variantes API Platform). */
  private loadPatientDocuments(patientId: number): void {
    this.patientDocumentsSub?.unsubscribe();
    this.patientDocumentsLoading.set(true);
    this.clearPatientDocumentsErrorDismissTimer();
    this.patientDocumentsError.set(null);
    this.patientDocumentsSub = this.documentService.listByPatientId(patientId).subscribe({
      next: (rawList) => {
        if (!this.isCurrentPatient(patientId)) {
          return;
        }
        const views = rawList
          .filter((row) => belongsToPatientRelationStrict(row, patientId))
          .map((row) => mapUnknownToPatientDocumentView(row))
          .filter((d): d is PatientDocumentView => d != null);
        views.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
        this.patientDocuments.set(views);
        this.clearPatientDocumentsErrorDismissTimer();
        this.patientDocumentsError.set(null);
        this.patientDocumentsLoading.set(false);
      },
      error: (err: unknown) => {
        if (!this.isCurrentPatient(patientId)) {
          return;
        }
        const http = err as HttpErrorResponse;
        if (http?.status === 401) {
          this.patientDocumentsError.set('Sesión caducada o no válida. Vuelve a iniciar sesión.');
        } else if (http?.status === 403) {
          this.patientDocumentsError.set('No tienes permiso para ver los documentos de este paciente.');
        } else if (http?.status === 400) {
          this.patientDocumentsError.set(
            'La petición de documentos no es válida. Revisa el filtro `patientId` en el API.'
          );
        } else if (http?.status === 0) {
          this.patientDocumentsError.set('No se pudo conectar con el servidor para cargar los documentos.');
        } else if (http?.status != null && http.status >= 500) {
          this.patientDocumentsError.set('El servidor devolvió un error al cargar los documentos.');
        } else {
          this.patientDocumentsError.set('No se pudieron cargar los documentos del paciente.');
        }
        this.schedulePatientDocumentsErrorAutoHide();
        this.patientDocuments.set([]);
        this.patientDocumentsLoading.set(false);
      },
    });
  }

  openPatientDocumentsFilePicker(input: HTMLInputElement): void {
    if (this.patientDocumentsZoneLocked()) {
      return;
    }
    input.click();
  }

  onPatientDocumentsDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.patientDocumentsZoneLocked() && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onPatientDocumentsDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.patientDocumentsZoneLocked()) {
      return;
    }
    const list = event.dataTransfer?.files;
    if (!list?.length) {
      return;
    }
    this.queuePatientDocumentUploads(Array.from(list));
  }

  onPatientDocumentsFileSelected(event: Event): void {
    if (this.patientDocumentsZoneLocked()) {
      return;
    }
    const input = event.target as HTMLInputElement | null;
    const files = input?.files;
    if (!files?.length) {
      return;
    }
    this.queuePatientDocumentUploads(Array.from(files));
    if (input) {
      input.value = '';
    }
  }

  private queuePatientDocumentUploads(files: File[]): void {
    const pid = this.verifiedPatientIdForRoute();
    if (pid == null) {
      this.showPatientFileFeedback(
        'error',
        'No hay un expediente de paciente válido o no coincide con la URL. Recarga la página.'
      );
      return;
    }
    const nonEmpty = files.filter((f) => f.size > 0);
    if (nonEmpty.length === 0) {
      this.showPatientFileFeedback(
        'error',
        files.length > 0 ? 'No se pueden subir archivos vacíos (0 bytes).' : 'No hay archivos.'
      );
      return;
    }
    const tooLarge = nonEmpty.filter((f) => f.size > PATIENT_DOCUMENT_MAX_BYTES);
    if (tooLarge.length > 0) {
      this.showPatientFileFeedback(
        'error',
        `Uno o más archivos superan ${PATIENT_DOCUMENT_MAX_BYTES / (1024 * 1024)} MB.`
      );
      return;
    }

    this.patientDocumentsUploading.set(true);
    this.clearPatientFileFeedbackTimer();
    this.patientFileFeedback.set(null);

    from(nonEmpty)
      .pipe(
        concatMap((file) =>
          this.documentService.create({
            file,
            patientId: pid,
            type: documentTypeForUpload(file),
            description: file.name,
          })
        ),
        toArray(),
        finalize(() => this.patientDocumentsUploading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          if (!this.isCurrentPatient(pid)) {
            return;
          }
          this.loadPatientDocuments(pid);
          const n = nonEmpty.length;
          this.showPatientFileFeedback(
            'success',
            n === 1 ? 'Documento guardado correctamente.' : `${n} documentos guardados correctamente.`
          );
        },
        error: (err: unknown) => {
          if (!this.isCurrentPatient(pid)) {
            return;
          }
          const http = err as HttpErrorResponse;
          let msg = 'No se pudo subir el documento.';
          if (http?.status === 400) {
            msg = 'El servidor no acepta este archivo o faltan datos (revisa tipo y paciente).';
          } else if (http?.status === 413) {
            msg = 'El archivo es demasiado grande para el servidor.';
          } else if (http?.status === 401 || http?.status === 403) {
            msg = 'No tienes permiso para subir documentos.';
          } else if (http?.status === 0) {
            msg = 'No se pudo conectar con el servidor.';
          }
          this.showPatientFileFeedback('error', msg);
        },
      });
  }

  onPatientDocumentDownload(doc: PatientDocumentView): void {
    const patientId = this.verifiedPatientIdForRoute();
    if (patientId == null) {
      this.showPatientFileFeedback(
        'error',
        'No hay un expediente de paciente válido o no coincide con la URL. Recarga la página.'
      );
      return;
    }
    const safeName = this.sanitizeDownloadFileName(doc.displayName);
    this.documentService
      .download(doc.id, patientId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = window.document.createElement('a');
          a.href = url;
          a.download = safeName;
          a.rel = 'noopener noreferrer';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (err: unknown) => {
          const http = err as HttpErrorResponse;
          let msg = 'No se pudo descargar el documento.';
          if (http?.status === 400) {
            msg = 'Falta o es inválido el contexto del paciente para esta descarga.';
          } else if (http?.status === 401 || http?.status === 403) {
            msg = 'No tienes permiso para descargar este documento.';
          } else if (http?.status === 404) {
            msg = 'El documento ya no está disponible en el servidor.';
          } else if (http?.status === 0) {
            msg = 'No se pudo conectar con el servidor.';
          } else if (http?.status != null && http.status >= 500) {
            msg = 'El servidor devolvió un error al descargar el documento.';
          }
          this.showPatientFileFeedback('error', msg);
        },
      });
  }

  /** Evita caracteres inválidos en el atributo `download` del navegador. */
  private sanitizeDownloadFileName(name: string): string {
    const base = name.trim() || 'documento';
    return base.replace(/[/\\?*:"<>|]/g, '_').slice(0, 180);
  }

  private showPatientFileFeedback(kind: 'success' | 'error', text: string): void {
    this.clearPatientFileFeedbackTimer();
    this.patientFileFeedback.set({ kind, text });
    this.patientFileFeedbackTimer = setTimeout(() => {
      this.patientFileFeedback.set(null);
      this.patientFileFeedbackTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearPatientFileFeedbackTimer(): void {
    if (this.patientFileFeedbackTimer) {
      clearTimeout(this.patientFileFeedbackTimer);
      this.patientFileFeedbackTimer = null;
    }
  }

  private clearBlockFeedbackDismissTimers(): void {
    this.clearAllergyFeedbackDismissTimer();
    this.clearContactFeedbackDismissTimer();
    this.clearConditionsFeedbackDismissTimer();
    this.clearVisitHistoryErrorDismissTimer();
    this.clearPatientDocumentsErrorDismissTimer();
  }

  private scheduleAllergyFeedbackAutoHide(): void {
    this.clearAllergyFeedbackDismissTimer();
    this.allergyFeedbackDismissTimer = setTimeout(() => {
      this.allergyFeedbackOk.set(null);
      this.allergyFeedbackError.set(null);
      this.allergyFeedbackDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearAllergyFeedbackDismissTimer(): void {
    if (this.allergyFeedbackDismissTimer) {
      clearTimeout(this.allergyFeedbackDismissTimer);
      this.allergyFeedbackDismissTimer = null;
    }
  }

  private scheduleContactFeedbackAutoHide(): void {
    this.clearContactFeedbackDismissTimer();
    this.contactFeedbackDismissTimer = setTimeout(() => {
      this.contactFeedbackOk.set(null);
      this.contactFeedbackError.set(null);
      this.contactFeedbackDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearContactFeedbackDismissTimer(): void {
    if (this.contactFeedbackDismissTimer) {
      clearTimeout(this.contactFeedbackDismissTimer);
      this.contactFeedbackDismissTimer = null;
    }
  }

  private scheduleConditionsFeedbackAutoHide(): void {
    this.clearConditionsFeedbackDismissTimer();
    this.conditionsFeedbackDismissTimer = setTimeout(() => {
      this.conditionsFeedbackOk.set(null);
      this.conditionsFeedbackError.set(null);
      this.conditionsFeedbackDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearConditionsFeedbackDismissTimer(): void {
    if (this.conditionsFeedbackDismissTimer) {
      clearTimeout(this.conditionsFeedbackDismissTimer);
      this.conditionsFeedbackDismissTimer = null;
    }
  }

  private scheduleVisitHistoryErrorAutoHide(): void {
    this.clearVisitHistoryErrorDismissTimer();
    this.visitHistoryErrorDismissTimer = setTimeout(() => {
      this.visitHistoryError.set(null);
      this.visitHistoryErrorDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearVisitHistoryErrorDismissTimer(): void {
    if (this.visitHistoryErrorDismissTimer) {
      clearTimeout(this.visitHistoryErrorDismissTimer);
      this.visitHistoryErrorDismissTimer = null;
    }
  }

  private schedulePatientDocumentsErrorAutoHide(): void {
    this.clearPatientDocumentsErrorDismissTimer();
    this.patientDocumentsErrorDismissTimer = setTimeout(() => {
      this.patientDocumentsError.set(null);
      this.patientDocumentsErrorDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearPatientDocumentsErrorDismissTimer(): void {
    if (this.patientDocumentsErrorDismissTimer) {
      clearTimeout(this.patientDocumentsErrorDismissTimer);
      this.patientDocumentsErrorDismissTimer = null;
    }
  }

  private describePatientLoadError(err: unknown, patientId: number): string {
    const http = err as HttpErrorResponse;
    const status = http?.status;
    if (status === 404) {
      return `No existe un paciente con el ID ${patientId} en la base de datos, o la ruta del API no lo encuentra.`;
    }
    if (status === 401 || status === 403) {
      return 'No tienes sesión o permiso para ver este paciente. Vuelve a iniciar sesión.';
    }
    if (status === 0) {
      return 'No se pudo conectar con el servidor (¿Symfony en marcha en http://127.0.0.1:8000?).';
    }
    if (status != null && status >= 500) {
      return 'El servidor devolvió un error al cargar el paciente (revisa los logs de Symfony).';
    }
    return 'No se pudo cargar el paciente. Verifica que exista o vuelve al panel del doctor.';
  }
}
