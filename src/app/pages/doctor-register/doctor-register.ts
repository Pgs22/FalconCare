import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-doctor-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
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
    private readonly router: Router,
    private readonly translate: TranslateService
  ) {}

  ngOnDestroy(): void {
    this.clearMessageDismissTimer();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  getFullNameError(): string | null {
    const normalized = this.fullName.trim().replace(/\s+/g, ' ');
    if (!normalized) return this.t('doctorRegister.errors.required');
    if (normalized.split(' ').length < 2) return this.t('doctorRegister.errors.fullNameIncomplete');
    const allowed = /^[\p{L}\s'’-]+$/u;
    if (!allowed.test(normalized)) return this.t('doctorRegister.errors.fullNameInvalid');
    return null;
  }

  getEmailError(): string | null {
    const value = this.email.trim();
    if (!value) return this.t('doctorRegister.errors.required');
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(value)) return this.t('doctorRegister.errors.invalidEmail');
    return null;
  }

  getPasswordError(): string | null {
    if (!this.password) return this.t('doctorRegister.errors.required');
    if (this.password.length < 8) return this.t('doctorRegister.errors.passwordMin');
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
        this.success.set(this.t('doctorRegister.messages.registerOkRedirecting'));
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/doctor-panel']), 700);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 400) {
          this.error.set(this.t('doctorRegister.errors.registerBadRequest'));
        } else if (httpError?.status === 401) {
          this.error.set(this.t('doctorRegister.errors.registeredLoginFailed'));
        } else if (httpError?.status === 0) {
          this.error.set(this.t('doctorRegister.errors.backendConnection'));
        } else {
          this.error.set(this.t('doctorRegister.errors.registerGeneric'));
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

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
