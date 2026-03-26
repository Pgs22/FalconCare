import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoginResponse } from '../models/login-response.model';

type LoginRequest = {
  email: string;
  password: string;
};

type RegisterDoctorRequest = {
  fullName: string;
  email: string;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly tokenStorageKey = 'falconcare_access_token';
  static readonly userStorageKey = 'falconcare_current_user';

  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    const url = `${environment.apiBaseUrl}/api/auth/login`;
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(url, body).pipe(
      tap((res) => {
        if (res?.accessToken) {
          localStorage.setItem(AuthService.tokenStorageKey, res.accessToken);
        }
        if (res?.user) {
          localStorage.setItem(AuthService.userStorageKey, JSON.stringify(res.user));
        }
      })
    );
  }

  registerDoctor(fullName: string, email: string, password: string): Observable<LoginResponse['user']> {
    const url = `${environment.apiBaseUrl}/api/auth/register-doctor`;
    const body: RegisterDoctorRequest = { fullName, email, password };
    return this.http.post<LoginResponse['user']>(url, body);
  }

  deleteMyAccount(): Observable<void> {
    const url = `${environment.apiBaseUrl}/api/auth/me`;
    return this.http.delete<void>(url);
  }

  logout(): void {
    localStorage.removeItem(AuthService.tokenStorageKey);
    localStorage.removeItem(AuthService.userStorageKey);
  }

  getToken(): string | null {
    return localStorage.getItem(AuthService.tokenStorageKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentUser(): LoginResponse['user'] | null {
    const raw = localStorage.getItem(AuthService.userStorageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LoginResponse['user'];
    } catch {
      return null;
    }
  }
}

