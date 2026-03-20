import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  email = '';
  password = '';
  showPassword = false;

  showSubmitError = false;
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return 'Este campo es obligatorio.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(v)) return 'Correo electrónico inválido. Usa un formato tipo: correo@ejemplo.com';
    return null;
  }

  getPasswordError(): string | null {
    if (!this.password) return 'Este campo es obligatorio.';
    return null;
  }

  private hasAnyFormatError(): boolean {
    return !!this.getEmailError() || !!this.getPasswordError();
  }

  onSubmit(): void {
    this.showSubmitError = true;
    this.error.set(null);
    if (this.hasAnyFormatError()) return;

    this.loading.set(true);

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 401) {
          this.error.set('Usuario no registrado o contraseña incorrecta.');
        } else if (httpError?.status === 0) {
          this.error.set('No se pudo conectar con el backend. Inténtalo de nuevo.');
        } else {
          this.error.set('No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
        }
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }
}

