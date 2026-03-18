import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule],
  template: `
    <main style="padding: 16px; max-width: 420px;">
      <h2>Login</h2>

      <form (ngSubmit)="onSubmit()" #f="ngForm">
        <label style="display:block; margin-top: 12px;">
          Email
          <input
            name="email"
            [(ngModel)]="email"
            type="email"
            required
            style="width: 100%; padding: 8px;"
          />
        </label>

        <label style="display:block; margin-top: 12px;">
          Password
          <input
            name="password"
            [(ngModel)]="password"
            type="password"
            required
            style="width: 100%; padding: 8px;"
          />
        </label>

        <button type="submit" [disabled]="loading() || !f.valid" style="margin-top: 16px; padding: 8px 12px;">
          {{ loading() ? 'Entrando...' : 'Entrar' }}
        </button>

        <p *ngIf="error()" style="margin-top: 12px; color: #b00020;">
          {{ error() }}
        </p>
      </form>
    </main>
  `,
})
export class LoginPageComponent {
  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  onSubmit(): void {
    this.error.set(null);
    this.loading.set(true);

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: () => {
        this.error.set('Credenciales inválidas o backend no disponible.');
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }
}

