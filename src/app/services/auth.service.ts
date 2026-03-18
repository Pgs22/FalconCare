import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoginResponse } from '../models/login-response.model';

type LoginRequest = {
  email: string;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly tokenStorageKey = 'falconcare_access_token';

  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    const url = `${environment.apiBaseUrl}/api/auth/login`;
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(url, body).pipe(
      tap((res) => {
        if (res?.accessToken) {
          localStorage.setItem(AuthService.tokenStorageKey, res.accessToken);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(AuthService.tokenStorageKey);
  }

  getToken(): string | null {
    return localStorage.getItem(AuthService.tokenStorageKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

