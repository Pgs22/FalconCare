import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-doctor-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './doctor-register.html',
  styleUrl: './doctor-register.css',
})
export class DoctorRegisterComponent implements OnDestroy {
  fullName = '';
  email = '';
  password = '';
  showPassword = false;
  showSubmitError = false;
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  private messageDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnDestroy(): void {
    this.clearMessageDismissTimer();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  getFullNameError(): string | null {
    const normalized = this.fullName.trim().replace(/\s+/g, ' ');
    if (!normalized) return 'Este campo es obligatorio.';
    if (normalized.split(' ').length < 2) return 'Introduce nombre y apellidos completos.';
    const allowed = /^[\p{L}\s'’-]+$/u;
    if (!allowed.test(normalized)) return 'El nombre solo debe contener letras y espacios.';
    return null;
  }

  getEmailError(): string | null {
    const value = this.email.trim();
    if (!value) return 'Este campo es obligatorio.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(value)) return 'Correo electrónico inválido. Usa un formato tipo: correo@ejemplo.com';
    return null;
  }

  getPasswordError(): string | null {
    if (!this.password) return 'Este campo es obligatorio.';
    if (this.password.length < 8) return 'La contraseña debe tener mínimo 8 caracteres.';
    return null;
  }

  private hasAnyFormatError(): boolean {
    return !!this.getFullNameError() || !!this.getEmailError() || !!this.getPasswordError();
  }

  onSubmit(): void {
    this.showSubmitError = true;
    this.clearMessageDismissTimer();
    this.error.set(null);
    this.success.set(null);
    if (this.hasAnyFormatError()) return;

    this.loading.set(true);
    const email = this.email.trim();
    const password = this.password;

    this.auth.registerDoctor(this.fullName.trim(), email, password).pipe(
      switchMap(() => this.auth.login(email, password))
    ).subscribe({
      next: () => {
        this.success.set('Registro completado correctamente. Redirigiendo al panel del doctor...');
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/doctor-panel']), 700);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 400) {
          this.error.set('No se pudo completar el registro. Revisa los datos e inténtalo de nuevo.');
        } else if (httpError?.status === 401) {
          this.error.set('El doctor se registró, pero no se pudo iniciar sesión automáticamente.');
        } else if (httpError?.status === 0) {
          this.error.set('No se pudo conectar con el backend. Inténtalo de nuevo.');
        } else {
          this.error.set('No se pudo registrar el doctor. Inténtalo de nuevo más tarde.');
        }
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
      },
    });
  }

  private scheduleMessagesAutoHide(): void {
    this.clearMessageDismissTimer();
    this.messageDismissTimer = setTimeout(() => {
      this.error.set(null);
      this.success.set(null);
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
