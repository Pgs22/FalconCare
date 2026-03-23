import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
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
  password = '';
  address = '';

  // En el wireframe, no aparece marcado con '*', por lo que no lo consideramos obligatorio.
  termsAccepted = false;

  showSubmitError = false;
  submitSuccessMessage: string | null = null;
  serverError: string | null = null;

  private normalizeSpaces(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizePhone(value: string): string {
    // Normaliza eliminando espacios y guiones, conservando el '+' inicial.
    // Ej: "+34 600 000 000" -> "+34600000000"
    const v = value.trim();
    const startsWithPlus = v.startsWith('+');
    const withoutSeparators = v.replace(/[ \-]/g, '');
    if (!startsWithPlus) return withoutSeparators.replace(/\+/g, '');
    return '+' + withoutSeparators.replace(/\+/g, '');
  }

  private splitFullName(value: string): { firstName: string; lastName: string } | null {
    const normalized = this.normalizeSpaces(value);
    if (!normalized) return null;
    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length < 2) return null;
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    if (!firstName || !lastName) return null;
    return { firstName, lastName };
  }

  getIdNumberError(): string | null {
    const v = this.idNumber.trim().toUpperCase();
    if (!v) return 'Este campo es obligatorio.';

    // DNI: 8 dígitos + letra (ej: 12345678Z)
    const dni = /^\d{8}[A-Z]$/;
    // NIE: X/Y/Z + 7 dígitos + letra (ej: X1234567A)
    const nie = /^[XYZ]\d{7}[A-Z]$/;
    // Pasaporte (aprox): 5-9 alfanuméricos
    const passport = /^[A-Z0-9]{5,9}$/;

    if (dni.test(v) || nie.test(v) || passport.test(v)) return null;
    return 'Formato de identidad inválido. Usa DNI (12345678A), NIE (X1234567A) o pasaporte (5-9 caracteres).';
  }

  getFullNameError(): string | null {
    const split = this.splitFullName(this.fullName);
    if (!split) return 'Introduce un nombre y apellidos completos (mínimo 2 palabras).';

    // Validación ligera: solo letras (incluye acentos) y separadores típicos.
    const normalized = this.normalizeSpaces(this.fullName);
    const allowed = /^[\p{L}\s'’-]+$/u;
    if (!allowed.test(normalized)) {
      return 'El nombre solo debe contener letras (y espacios). Evita números o caracteres especiales.';
    }
    return null;
  }

  getPhoneError(): string | null {
    const normalized = this.normalizePhone(this.phone);
    if (!normalized) return 'Este campo es obligatorio.';

    // Esperado: +34 seguido de 9 dígitos (total 12 caracteres contando '+')
    const re = /^\+34\d{9}$/;
    if (re.test(normalized)) return null;
    return 'Formato de teléfono inválido. Ejemplo: +34 000 00 00 00';
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return 'Este campo es obligatorio.';
    // Validador simple
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (re.test(v)) return null;
    return 'Correo electrónico inválido. Usa un formato tipo: correo@ejemplo.com';
  }

  getPasswordError(): string | null {
    const v = this.password;
    if (!v) return 'Este campo es obligatorio.';
    if (v.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
    return null;
  }

  getAddressError(): string | null {
    const v = this.address.trim();
    if (!v) return null;
    // Si se rellena, intenta respetar “Calle, número, ciudad” (al menos 2 comas).
    if (!v.includes(',') || (v.match(/,/g)?.length ?? 0) < 2) {
      return 'Dirección con formato inválido. Usa “Calle, número, ciudad”.';
    }
    return null;
  }

  getTermsError(): string | null {
    if (this.termsAccepted) return null;
    return 'Debes aceptar los Términos y Condiciones y la Política de Privacidad.';
  }

  private hasAnyFormatError(): boolean {
    return (
      !!this.getIdNumberError() ||
      !!this.getFullNameError() ||
      !!this.getPhoneError() ||
      !!this.getEmailError() ||
      !!this.getPasswordError() ||
      !!this.getAddressError() ||
      !!this.getTermsError()
    );
  }

  constructor(
    private readonly patientService: PatientService,
    private readonly router: Router
  ) {}

  onSubmit(form: NgForm): void {
    this.showSubmitError = true;
    this.submitSuccessMessage = null;
    this.serverError = null;
    if (form.invalid) return;

    // Errores de formato adicionales que no dependen solo de HTML5.
    if (this.hasAnyFormatError()) return;

    const split = this.splitFullName(this.fullName);
    if (!split) return;
    const firstName = split.firstName;
    const lastName = split.lastName;

    // Contrato exacto para POST /api/patients (camelCase).
    // Se envían strings no vacíos en todos los obligatorios.
    const payload: RegisterPatientPayload = {
      identityDocument: this.idNumber,
      firstName,
      lastName,
      ssNumber: null,
      phone: this.normalizePhone(this.phone),
      email: this.email.trim(),
      address: this.address.trim() || 'N/A',
      consultationReason: 'Sin información inicial',
      familyHistory: 'Sin información inicial',
      healthStatus: 'Sin información inicial',
      lifestyleHabits: 'Sin información inicial',
      registrationDate: new Date().toISOString(),
      medicationAllergies: 'Sin información inicial',
    };

    this.patientService.registerPatient(payload).subscribe({
      next: () => {
        this.showSubmitError = false;
        this.submitSuccessMessage = 'Registro completado correctamente.';
        form.resetForm();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        if (err instanceof HttpErrorResponse) {
          if (err.status === 400) {
            this.serverError =
              'Datos inválidos o paciente ya existente. Revisa identidad, email y campos obligatorios.';
            return;
          }
          if (err.status === 401) {
            this.serverError =
              'Error de autorización en el registro. Revisa la configuración del interceptor/backend.';
            return;
          }
          if (err.status === 0) {
            this.serverError =
              'No se pudo conectar con el backend (servicio caído o puerto incorrecto).';
            return;
          }
        }

        this.serverError = 'No se pudo completar el registro. Inténtalo de nuevo.';
      },
    });
  }
}

