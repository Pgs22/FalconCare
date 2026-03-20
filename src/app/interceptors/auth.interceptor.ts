import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

const API_PREFIX = `${environment.apiBaseUrl}/api`;
const LOGIN_URL = `${API_PREFIX}/auth/login`;
const DOCS_PREFIX = `${API_PREFIX}/docs`;
const HEALTH_URL = `${API_PREFIX}/health`;
const PATIENTS_URL = `${API_PREFIX}/patients`;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;

  const isApiCall = url.startsWith(API_PREFIX);
  const isLogin = url === LOGIN_URL;
  const isDocs = url.startsWith(DOCS_PREFIX);
  const isHealth = url === HEALTH_URL;
  // El registro de pacientes debe ser público: no adjuntar Bearer y no redirigir a login.
  const isPatientRegistration = url === PATIENTS_URL && req.method === 'POST';

  if (!isApiCall || isLogin || isDocs || isHealth || isPatientRegistration) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.logout();
        router.navigate(['/login'], {
          queryParams: { sessionExpired: '1' },
        });
      }

      return throwError(() => error);
    })
  );
};

