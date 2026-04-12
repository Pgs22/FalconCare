import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { PROFILE_IMAGE_DEFAULT_URL } from '../../constants/profile-image-upload-feedback';
import { AuthService } from '../../services/auth.service';
import { AppUser, UserService } from '../../services/user.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent implements OnInit, OnDestroy {
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  showSubmitError = false;

  loading = signal(false);
  deleting = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);
  profileImageUrl = signal<string | null>(null);
  imageUploading = signal(false);
  imageError = signal<string | null>(null);
  imageSuccess = signal<string | null>(null);
  readonly defaultAvatarUrl = PROFILE_IMAGE_DEFAULT_URL;

  private userId: number | null = null;
  private formMessageDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private imageMessageDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly userService: UserService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.auth.getCurrentUser();
    this.email = currentUser?.email ?? '';
    this.userId = currentUser?.id ?? null;
    this.profileImageUrl.set(
      currentUser?.profile_image ?? currentUser?.profile_image_url ?? currentUser?.profileImageUrl ?? null
    );
    if (this.userId) {
      this.userService.getById(this.userId).subscribe({
        next: (user) => {
          this.profileImageUrl.set(user.profileImageUrl);
          this.storeCurrentUserImage(user.profileImageUrl);
        },
        error: () => {
          // Carga silenciosa: se mantiene cache de sesión si existe.
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.clearFormMessageDismissTimer();
    this.clearImageMessageDismissTimer();
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
    this.clearFormMessageDismissTimer();
    this.success.set(null);
    this.error.set(null);

    if (this.hasAnyFormatError()) return;

    this.loading.set(true);
    this.resolveUserIdAndUpdate();
  }

  onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    this.clearImageMessageDismissTimer();
    this.imageError.set(null);
    this.imageSuccess.set(null);
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.imageError.set('Solo se permiten archivos de imagen.');
      this.scheduleImageMessagesAutoHide();
      input.value = '';
      return;
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      this.imageError.set('La imagen es demasiado grande o inválida.');
      this.scheduleImageMessagesAutoHide();
      input.value = '';
      return;
    }

    if (!this.userId) {
      this.imageError.set('No se pudo identificar tu usuario. Vuelve a iniciar sesión.');
      this.scheduleImageMessagesAutoHide();
      input.value = '';
      return;
    }

    this.imageUploading.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        this.imageUploading.set(false);
        this.imageError.set('No se pudo procesar la imagen seleccionada.');
        this.scheduleImageMessagesAutoHide();
        input.value = '';
        return;
      }

      this.userService.updateProfileImage(this.userId as number, result).subscribe({
        next: (user) => {
          this.profileImageUrl.set(user.profileImageUrl);
          this.storeCurrentUserImage(user.profileImageUrl);
          this.imageSuccess.set('Imagen de perfil actualizada correctamente.');
          this.scheduleImageMessagesAutoHide();
          this.imageUploading.set(false);
          input.value = '';
        },
        error: (err: unknown) => {
          const http = err as HttpErrorResponse;
          if (http?.status === 400) {
            this.imageError.set('La imagen es demasiado grande o inválida.');
          } else if (http?.status === 403) {
            this.imageError.set('No tienes permisos para editar este perfil.');
          } else if (http?.status === 401) {
            this.imageError.set('Tu sesión ha expirado. Vuelve a iniciar sesión.');
          } else {
            this.imageError.set('No se pudo actualizar la imagen. Inténtalo de nuevo.');
          }
          this.scheduleImageMessagesAutoHide();
          this.imageUploading.set(false);
          input.value = '';
        },
      });
    };
    reader.readAsDataURL(file);
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
          this.scheduleFormMessagesAutoHide();
          this.loading.set(false);
          return;
        }
        this.userId = found.id;
        this.updateUser(found.id);
      },
      error: () => {
        this.error.set('No se pudo identificar tu usuario. Vuelve a iniciar sesión e inténtalo de nuevo.');
        this.scheduleFormMessagesAutoHide();
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
        this.scheduleFormMessagesAutoHide();
        this.password = '';
        this.confirmPassword = '';
        const current = this.auth.getCurrentUser();
        this.auth.setCurrentUser({
          id: updated.id,
          email: updated.email,
          roles: updated.roles,
          fullName: current?.fullName,
          profileImageUrl: this.profileImageUrl(),
          profile_image_url: this.profileImageUrl(),
          profile_image: this.profileImageUrl(),
        });
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
        this.scheduleFormMessagesAutoHide();
        this.loading.set(false);
      },
    });
  }

  onDeleteAccount(): void {
    if (this.loading() || this.deleting()) return;
    const confirmed = window.confirm('Esta acción eliminará tu cuenta de doctor de forma permanente. ¿Deseas continuar?');
    if (!confirmed) return;

    this.clearFormMessageDismissTimer();
    this.error.set(null);
    this.success.set(null);
    this.deleting.set(true);

    this.auth.deleteMyAccount().subscribe({
      next: () => {
        this.auth.logout();
        this.deleting.set(false);
        this.router.navigate(['/login']);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 401 || httpError?.status === 403) {
          this.error.set('No tienes permisos para eliminar esta cuenta.');
        } else {
          this.error.set('No se pudo eliminar la cuenta. Inténtalo de nuevo.');
        }
        this.scheduleFormMessagesAutoHide();
        this.deleting.set(false);
      },
    });
  }

  private scheduleFormMessagesAutoHide(): void {
    this.clearFormMessageDismissTimer();
    this.formMessageDismissTimer = setTimeout(() => {
      this.success.set(null);
      this.error.set(null);
      this.formMessageDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearFormMessageDismissTimer(): void {
    if (this.formMessageDismissTimer) {
      clearTimeout(this.formMessageDismissTimer);
      this.formMessageDismissTimer = null;
    }
  }

  private scheduleImageMessagesAutoHide(): void {
    this.clearImageMessageDismissTimer();
    this.imageMessageDismissTimer = setTimeout(() => {
      this.imageSuccess.set(null);
      this.imageError.set(null);
      this.imageMessageDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearImageMessageDismissTimer(): void {
    if (this.imageMessageDismissTimer) {
      clearTimeout(this.imageMessageDismissTimer);
      this.imageMessageDismissTimer = null;
    }
  }

  resolvedProfileImageUrl(): string {
    return this.profileImageUrl() ?? this.defaultAvatarUrl;
  }

  private storeCurrentUserImage(profileImage: string | null): void {
    const current = this.auth.getCurrentUser();
    if (!current) {
      return;
    }
    this.auth.setCurrentUser({
      ...current,
      profileImageUrl: profileImage,
      profile_image_url: profileImage,
      profile_image: profileImage,
    });
  }
}

