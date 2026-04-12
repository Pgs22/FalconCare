import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { PatientService, RegisterPatientPayload } from '../../services/patient.service';

@Component({
  selector: 'app-patient-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-register.html',
  styleUrl: './patient-register.css',
})
export class PatientRegisterComponent implements OnDestroy {
  idNumber = '';
  fullName = '';
  phone = '';
  email = '';
  address = '';
  showSubmitError = false;
  serverError: string | null = null;
  successMessage: string | null = null;
  loading = signal(false);
  private messageDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly patientService: PatientService,
    private readonly router: Router
  ) {}

  ngOnDestroy(): void {
    this.clearMessageDismissTimer();
  }

  goToDoctorPanel(): void {
    if (this.loading()) return;
    this.router.navigate(['/doctor-panel']);
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
    if (!v) return 'Este campo es obligatorio.';
    const dni = /^\d{8}[A-Z]$/;
    const nie = /^[XYZ]\d{7}[A-Z]$/;
    const passport = /^[A-Z0-9]{5,9}$/;
    if (dni.test(v) || nie.test(v) || passport.test(v)) return null;
    return 'Formato de identidad inválido. Usa DNI (12345678A), NIE (X1234567A) o pasaporte (5-9 caracteres).';
  }

  getFullNameError(): string | null {
    const split = this.splitFullName(this.fullName);
    if (!split) return 'Introduce un nombre y apellidos completos (mínimo 2 palabras).';
    const normalized = this.fullName.trim().replace(/\s+/g, ' ');
    const allowed = /^[\p{L}\s'’-]+$/u;
    if (!allowed.test(normalized)) {
      return 'El nombre solo debe contener letras (y espacios). Evita números o caracteres especiales.';
    }
    return null;
  }

  getPhoneError(): string | null {
    const normalized = this.normalizePhone(this.phone);
    if (!normalized) return 'Este campo es obligatorio.';
    const re = /^\+?\d{7,15}$/;
    if (re.test(normalized)) return null;
    return 'Formato de teléfono inválido. Usa un número internacional válido (7-15 dígitos), por ejemplo: +1 212 555 0199';
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return 'Este campo es obligatorio.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (re.test(v)) return null;
    return 'Correo electrónico inválido. Usa un formato tipo: correo@ejemplo.com';
  }

  getAddressError(): string | null {
    const v = this.address.trim();
    if (!v) return null;
    if (!v.includes(',') || (v.match(/,/g)?.length ?? 0) < 2) {
      return 'Dirección con formato inválido. Usa “Calle, número, ciudad”.';
    }
    return null;
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
      consultationReason: 'Sin información inicial',
      familyHistory: 'Sin información inicial',
      healthStatus: 'Sin información inicial',
      lifestyleHabits: 'Sin información inicial',
      medicationAllergies: 'Sin información inicial',
      registrationDate: new Date().toISOString(),
    };

    this.patientService.registerPatient(payload).subscribe({
      next: (created) => {
        this.showSubmitError = false;
        form.resetForm();
        const newId = this.extractCreatedPatientId(created);
        if (newId == null) {
          this.serverError =
            'El paciente se registró, pero no se recibió el identificador. Vuelve al panel del doctor e inténtalo de nuevo.';
          this.scheduleMessagesAutoHide();
          this.loading.set(false);
          return;
        }
        this.successMessage =
          'Paciente registrado correctamente. Abriendo el expediente del paciente...';
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/patient-panel', newId]), 700);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 400) {
          this.serverError = 'Datos inválidos o paciente ya existente.';
        } else if (httpError?.status === 0) {
          this.serverError = 'No se pudo conectar con el backend.';
        } else {
          this.serverError = 'No se pudo completar el registro. Inténtalo de nuevo.';
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
}
