import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AppUser, UserService } from '../../services/user.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent implements OnInit {
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  showSubmitError = false;

  loading = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);

  private userId: number | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly userService: UserService
  ) {}

  ngOnInit(): void {
    const currentUser = this.auth.getCurrentUser();
    this.email = currentUser?.email ?? '';
    this.userId = currentUser?.id ?? null;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return 'Este campo es obligatorio.';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(v)) return 'Correo electrónico inválido. Usa un formato tipo: correo@ejemplo.com';
    return null;
  }

  getPasswordError(): string | null {
    if (!this.password) return null;
    if (this.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    return null;
  }

  getConfirmPasswordError(): string | null {
    if (!this.password && !this.confirmPassword) return null;
    if (!this.confirmPassword) return 'Debes confirmar la contraseña.';
    if (this.password !== this.confirmPassword) return 'Las contraseñas no coinciden.';
    return null;
  }

  private hasAnyFormatError(): boolean {
    return !!this.getEmailError() || !!this.getPasswordError() || !!this.getConfirmPasswordError();
  }

  onSubmit(): void {
    this.showSubmitError = true;
    this.success.set(null);
    this.error.set(null);

    if (this.hasAnyFormatError()) return;

    this.loading.set(true);
    this.resolveUserIdAndUpdate();
  }

  private resolveUserIdAndUpdate(): void {
    if (this.userId) {
      this.updateUser(this.userId);
      return;
    }

    this.userService.listUsers().subscribe({
      next: (users) => {
        const found = this.findCurrentUser(users);
        if (!found) {
          this.error.set('No se pudo identificar tu usuario para actualizar los datos.');
          this.loading.set(false);
          return;
        }
        this.userId = found.id;
        this.updateUser(found.id);
      },
      error: () => {
        this.error.set('No se pudo identificar tu usuario. Vuelve a iniciar sesión e inténtalo de nuevo.');
        this.loading.set(false);
      },
    });
  }

  private findCurrentUser(users: AppUser[]): AppUser | undefined {
    const currentUser = this.auth.getCurrentUser();
    if (currentUser?.id) {
      return users.find((u) => u.id === currentUser.id);
    }
    if (currentUser?.email) {
      const email = currentUser.email.toLowerCase().trim();
      return users.find((u) => u.email.toLowerCase().trim() === email);
    }
    return undefined;
  }

  private updateUser(userId: number): void {
    const payload: { email: string; plainPassword?: string } = {
      email: this.email.trim(),
    };

    if (this.password) {
      payload.plainPassword = this.password;
    }

    this.userService.updateUser(userId, payload).subscribe({
      next: (updated) => {
        this.success.set('Datos actualizados correctamente.');
        this.password = '';
        this.confirmPassword = '';
        localStorage.setItem(
          AuthService.userStorageKey,
          JSON.stringify({
            id: updated.id,
            email: updated.email,
            roles: updated.roles,
          })
        );
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 422) {
          this.error.set('Los datos enviados no son válidos. Revisa el formulario.');
        } else if (httpError?.status === 401 || httpError?.status === 403) {
          this.error.set('No tienes permisos para actualizar estos datos.');
        } else {
          this.error.set('No se pudieron actualizar los datos. Inténtalo de nuevo.');
        }
        this.loading.set(false);
      },
    });
  }
}

