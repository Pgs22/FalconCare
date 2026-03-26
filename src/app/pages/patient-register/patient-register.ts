import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { PatientService, RegisterPatientPayload } from '../../services/patient.service';

@Component({
  selector: 'app-patient-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-register.html',
  styleUrl: './patient-register.css',
})
export class PatientRegisterComponent {
  idNumber = '';
  fullName = '';
  phone = '';
  email = '';
  address = '';
  showSubmitError = false;
  serverError: string | null = null;
  successMessage: string | null = null;
  loading = signal(false);

  constructor(
    private readonly patientService: PatientService,
    private readonly router: Router
  ) {}

  goToDoctorPanel(): void {
    if (this.loading()) return;
    this.router.navigate(['/doctor-panel']);
  }

  private normalizePhone(value: string): string {
    const v = value.trim();
    const startsWithPlus = v.startsWith('+');
    const withoutSeparators = v.replace(/[ \-]/g, '');
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
    const re = /^\+34\d{9}$/;
    if (re.test(normalized)) return null;
    return 'Formato de teléfono inválido. Ejemplo: +34 000 00 00 00';
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
      next: () => {
        this.showSubmitError = false;
        form.resetForm();
        this.successMessage = 'Paciente registrado correctamente. Redirigiendo al panel del doctor...';
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/doctor-panel']), 700);
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
        this.loading.set(false);
      },
    });
  }
}
