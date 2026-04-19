import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

const API_PREFIX = `${environment.apiBaseUrl}/api`;
const LOGIN_URL = `${API_PREFIX}/auth/login`;
const REGISTER_DOCTOR_URL = `${API_PREFIX}/auth/register-doctor`;
/** OpenAPI / Swagger UI habitual en API Platform (`/api/docs`, `/api/docs.json`, etc.). */
const DOCS_PREFIX = `${API_PREFIX}/docs`;
const HEALTH_URL = `${API_PREFIX}/health`;
/** Registro público de paciente: sin JWT. */
const PATIENTS_COLLECTION_URL = `${API_PREFIX}/patients`;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;

  const isApiCall = url.includes('/api/');
  const isLogin = url === LOGIN_URL;
  const isRegisterDoctor = url === REGISTER_DOCTOR_URL;
  const isDocs = url.startsWith(DOCS_PREFIX);
  const isHealth = url === HEALTH_URL;
  const isPublicPatientRegister = req.method === 'POST' && url.includes('/api/patients');

  if (
    !isApiCall ||
    isLogin ||
    isRegisterDoctor ||
    isDocs ||
    isHealth ||
    isPublicPatientRegister
  ) {
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

