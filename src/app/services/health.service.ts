import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface HealthStatus {
  status: 'ok' | 'error' | string;
  details?: unknown;
}

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly healthUrl = `${environment.apiBaseUrl}/api/health`;

  constructor(private readonly http: HttpClient) {}

  check(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(this.healthUrl);
  }
}

