import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { AuthService } from '../../services/auth.service';
import { LanguageService, type SupportedLanguage } from '../../services/language.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent implements OnDestroy {
  email = '';
  password = '';
  showPassword = false;
  showSubmitError = false;
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  readonly languageOptions: ReadonlyArray<{ code: SupportedLanguage; label: string }> = [
    { code: 'es', label: 'Español' },
    { code: 'ca', label: 'Català' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
  ];
  selectedLanguage: SupportedLanguage;
  private messageDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly languageService: LanguageService,
    private readonly translate: TranslateService
  ) {
    this.selectedLanguage = this.languageService.current();
    if (this.route.snapshot.queryParamMap.get('sessionExpired') === '1') {
      this.error.set(this.t('login.errors.sessionExpired'));
      this.scheduleMessagesAutoHide();
    }
    if (this.route.snapshot.queryParamMap.get('registered') === '1') {
      this.success.set(this.t('login.messages.registered'));
      this.scheduleMessagesAutoHide();
    }
  }

  ngOnDestroy(): void {
    this.clearMessageDismissTimer();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onLanguageChange(language: SupportedLanguage): void {
    this.selectedLanguage = language;
    this.languageService.use(language);
  }

  getEmailError(): string | null {
    const v = this.email.trim();
    if (!v) return this.t('login.errors.required');
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(v)) return this.t('login.errors.invalidEmail');
    return null;
  }

  getPasswordError(): string | null {
    if (!this.password) return this.t('login.errors.required');
    return null;
  }

  private hasAnyFormatError(): boolean {
    return !!this.getEmailError() || !!this.getPasswordError();
  }

  onSubmit(): void {
    this.showSubmitError = true;
    this.clearMessageDismissTimer();
    this.error.set(null);
    this.success.set(null);
    if (this.hasAnyFormatError()) return;
    this.loading.set(true);

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/doctor-panel';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 401) {
          this.error.set(this.t('login.errors.invalidCredentials'));
        } else if (httpError?.status === 0) {
          this.error.set(this.t('login.errors.backendUnavailable'));
        } else {
          this.error.set(this.t('login.errors.generic'));
        }
        this.scheduleMessagesAutoHide();
        this.loading.set(false);
      },
      complete: () => {
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

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
