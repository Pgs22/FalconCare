import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { PatientService, RegisterPatientPayload } from '../../services/patient.service';
import { AllergyFlag, buildAllergiesBitmask } from '../../models/patient.model';

@Component({
  selector: 'app-patient-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './patient-register.html',
  styleUrl: './patient-register.css',
})
export class PatientRegisterComponent implements OnDestroy, OnInit {
  idNumber = '';
  fullName = '';
  phone = '';
  email = '';
  address = '';
  showSubmitError = false;
  serverError: string | null = null;
  successMessage: string | null = null;
  loading = signal(false);
  private returnUrl = '/appointments';
  private messageDismissTimer: ReturnType<typeof setTimeout> | null = null;
  readonly allergyOptions = [
    { flag: AllergyFlag.PENICILLIN, label: 'Penicil·lina' },
    { flag: AllergyFlag.LATEX, label: 'Làtex' },
    { flag: AllergyFlag.ANESTHESIA, label: 'Anestèsia' },
    { flag: AllergyFlag.NSAIDS, label: 'AINEs' },
    { flag: AllergyFlag.CHLORHEXIDINE, label: 'Clorhexidina' },
  ] as const;
  selectedAllergies: number[] = [];

  constructor(
    private readonly patientService: PatientService,
    private readonly router: Router,
    private readonly translate: TranslateService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const requestedReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '';
    this.returnUrl = requestedReturnUrl.startsWith('/') ? requestedReturnUrl : '/appointments';
  }

  ngOnDestroy(): void {
    this.clearMessageDismissTimer();
  }

  goToDoctorPanel(): void {
    if (this.loading()) return;
    this.router.navigateByUrl(this.returnUrl || '/appointments');
  }

  /** Acepta respuesta JSON en camelCase o snake_case del API. */
  private extractCreatedPatientId(body: unknown): number | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const o = body as Record<string, unknown>;
    const raw = o['id'] ?? o['patientId'] ?? o['patient_id'];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
    return undefined;
  }

  private normalizePhone(value: string): string {
    const v = value.trim();
    const startsWithPlus = v.startsWith('+');
    const withoutSeparators = v.replace(/[\s\-().]/g, '');
    if (!startsWithPlus) return withoutSeparators.replace(/\+/g, '');
    return '+' + withoutSeparators.replace(/\+/g, '');
  }

  private splitFullName(value: string): { firstName: string; lastName: string } | null {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length < 2) return null;
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
  }

  getIdNumberError(): string | null {
    const v = this.idNumber.trim().toUpperCase();
    if (!v) return this.t('patientRegister.errors.required');
    const dni = /^\d{8}[A-Z]$/;
    const nie = /^[XYZ]\d{7}[A-Z]$/;
    const passport = /^[A-Z0-9]{5,9}$/;
    if (dni.test(v) || nie.test(v) || passport.test(v)) return null;
    return this.t('patientRegister.errors.identityInvalid');
  }

  getFullNameError(): string | null {
    const split = this.splitFullName(this.fullName);
    if (!split) return this.t('patientRegister.errors.fullNameIncomplete');
    const normalized = this.fullName.trim().replace(/\s+/g, ' ');
    const allowed = /^[\p{L}\s'’-]+$/u;
    if (!allowed.test(normalized)) {
      return this.t('patientRegister.errors.fullNameInvalid');
    }
    return null;
  }

  getPhoneError(): string | null {
    const normalized = this.normalizePhone(this.phone);
    if (!normalized) return this.t('patientRegister.errors.required');
    const re = /^\+?\d{7,15}$/;
    if (re.test(normalized)) return null;
    return this.t('patientRegister.errors.phoneInvalid');
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return this.t('patientRegister.errors.required');
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (re.test(v)) return null;
    return this.t('patientRegister.errors.emailInvalid');
  }

  getAddressError(): string | null {
    const v = this.address.trim();
    if (!v) return null;
    if (!v.includes(',') || (v.match(/,/g)?.length ?? 0) < 2) {
      return this.t('patientRegister.errors.addressInvalid');
    }
    return null;
  }

  isAllergySelected(flag: number): boolean {
    return this.selectedAllergies.includes(flag);
  }

  toggleAllergy(flag: number, checked: boolean): void {
    if (checked) {
      if (!this.selectedAllergies.includes(flag)) {
        this.selectedAllergies = [...this.selectedAllergies, flag].sort((a, b) => a - b);
      }
      return;
    }

    this.selectedAllergies = this.selectedAllergies.filter((item) => item !== flag);
  }

  getSelectedAllergyText(): string {
    return this.allergyOptions
      .filter((option) => this.selectedAllergies.includes(option.flag))
      .map((option) => option.label.toLocaleUpperCase('es-ES'))
      .join(', ');
  }

  private hasAnyFormatError(): boolean {
    return (
      !!this.getIdNumberError() ||
      !!this.getFullNameError() ||
      !!this.getPhoneError() ||
      !!this.getEmailError() ||
      !!this.getAddressError()
    );
  }

  onSubmit(form: NgForm): void {
    this.showSubmitError = true;
    this.clearMessageDismissTimer();
    this.serverError = null;
    this.successMessage = null;
    if (form.invalid) return;
    if (this.hasAnyFormatError()) return;
    const split = this.splitFullName(this.fullName);
    if (!split) return;

    this.loading.set(true);

    const payload: RegisterPatientPayload = {
      identityDocument: this.idNumber.trim(),
      firstName: split.firstName,
      lastName: split.lastName,
      ssNumber: null,
      phone: this.normalizePhone(this.phone),
      email: this.email.trim(),
      address: this.address.trim() || 'N/A',
      consultationReason: this.t('patientRegister.defaults.noInitialInfo'),
      familyHistory: this.t('patientRegister.defaults.noInitialInfo'),
      healthStatus: this.t('patientRegister.defaults.noInitialInfo'),
      lifestyleHabits: this.t('patientRegister.defaults.noInitialInfo'),
      medicationAllergies: this.getSelectedAllergyText(),
      selectedAllergies: [...this.selectedAllergies],
      allergiesBitmask: buildAllergiesBitmask(this.selectedAllergies),
      registrationDate: new Date().toISOString(),
    };

    this.patientService.registerPatient(payload).subscribe({
      next: (created) => {
        this.showSubmitError = false;
        form.resetForm();
        const newId = this.extractCreatedPatientId(created);
        if (newId == null) {
          this.serverError =
            this.t('patientRegister.errors.createdWithoutId');
          this.scheduleMessagesAutoHide();
          this.loading.set(false);
          return;
        }
        this.successMessage =
          this.t('patientRegister.messages.registerOkOpeningRecord');
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
        this.selectedAllergies = [];
        setTimeout(() => this.router.navigate(['/patient-panel', newId]), 700);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 400) {
          this.serverError = this.t('patientRegister.errors.badRequest');
        } else if (httpError?.status === 0) {
          this.serverError = this.t('patientRegister.errors.backendConnection');
        } else {
          this.serverError = this.t('patientRegister.errors.generic');
        }
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
      },
    });
  }

  private scheduleMessagesAutoHide(): void {
    this.clearMessageDismissTimer();
    this.messageDismissTimer = setTimeout(() => {
      this.serverError = null;
      this.successMessage = null;
      this.messageDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearMessageDismissTimer(): void {
    if (this.messageDismissTimer) {
      clearTimeout(this.messageDismissTimer);
      this.messageDismissTimer = null;
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
