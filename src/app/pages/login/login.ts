import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnDestroy, signal } from '@angular/core';
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
  readonly languageOptions: ReadonlyArray<{ code: SupportedLanguage; label: string; flagSrc: string; flagAlt: string }> = [
    { code: 'es', label: 'Español', flagSrc: '/assets/flags/es.svg', flagAlt: 'Bandera de España' },
    { code: 'ca', label: 'Català', flagSrc: '/assets/flags/ca.svg', flagAlt: 'Bandera de Cataluña' },
    { code: 'en', label: 'English', flagSrc: '/assets/flags/gb.svg', flagAlt: 'Flag of the United Kingdom' },
    { code: 'fr', label: 'Français', flagSrc: '/assets/flags/fr.svg', flagAlt: 'Drapeau de la France' },
  ];
  selectedLanguage: SupportedLanguage;
  languageMenuOpen = false;
  private messageDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly languageService: LanguageService,
    private readonly translate: TranslateService,
    private readonly elementRef: ElementRef<HTMLElement>
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

  get selectedLanguageOption() {
    return this.languageOptions.find((l) => l.code === this.selectedLanguage) ?? this.languageOptions[0];
  }

  toggleLanguageMenu(): void {
    this.languageMenuOpen = !this.languageMenuOpen;
  }

  onLanguageChange(language: SupportedLanguage): void {
    this.selectedLanguage = language;
    this.languageService.use(language);
    this.languageMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.languageMenuOpen) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (!this.elementRef.nativeElement.contains(target)) {
      this.languageMenuOpen = false;
    }
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
