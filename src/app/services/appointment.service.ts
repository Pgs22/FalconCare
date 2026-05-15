import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';

export const APPOINTMENT_STATUSES = [
  'Programada',
  'Confirmada',
  'En curs',
  'Arribada',
  'Cancelada',
  'Finalitzada',
  'Falta consentiment',
] as const;

export const MANUAL_APPOINTMENT_STATUSES = [
  'Confirmada',
  'Arribada',
  'Cancelada',
] as const;

export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];
export type ManualAppointmentStatus = typeof MANUAL_APPOINTMENT_STATUSES[number];

export interface AppointmentStatusesResponse {
  statuses: AppointmentStatus[];
  manualStatuses: ManualAppointmentStatus[];
}

export interface AppointmentStatusUpdateResponse {
  ok?: boolean;
  code?: string;
  id?: number;
  status?: AppointmentStatus | string;
  appointment?: {
    id?: number;
    status?: AppointmentStatus | string;
  };
}

export interface Appointment {
  id: number;
  time: string;
  duration: number;
  cleaningTime: number;
  totalBlockTime: number;
  status: string;
  doctorId?: number | null;
  patientId?: number | null;
  patientName: string;
  doctorName: string;
  boxId: number | null;
  box: string;
  reason: string;
  color: string;
  visitDate?: string;
  isUrgency?: boolean;
  isFirstVisit?: boolean;
  allergyLabels?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/appointment`;
  private readonly patientsUrl = `${environment.apiBaseUrl}/api/patients`;
  private readonly treatmentsUrl = `${environment.apiBaseUrl}/api/treatments`;

  constructor(private http: HttpClient) {}

  getAppointments(date?: string): Observable<Appointment[]> {
    const url = date ? `${this.apiUrl}/index?date=${date}` : `${this.apiUrl}/index`;
    return this.http.get<Appointment[]>(url);
  }

  getWeeklyAppointments(date?: string): Observable<Appointment[]> {
    const url = date ? `${this.apiUrl}/weekly?date=${date}` : `${this.apiUrl}/weekly`;
    return this.http.get<Appointment[]>(url);
  }

  getSetupFormData(date: string): Observable<any> {
    const params = new HttpParams().set('date', date);
    return this.http.get<{doctors: any[], boxes: any[]}>(
        `${this.apiUrl}/setup-appointment-form`, 
        { params }
      );
  }

  createAppointment(appointmentData: any): Observable<any> {
    const isNotFound = (err: unknown): boolean => {
      const status = (err as { status?: number } | null)?.status;
      return status === 404;
    };

    return this.http.post(`${this.apiUrl}/create`, appointmentData).pipe(
      catchError((err) => {
        if (!isNotFound(err)) {
          return throwError(() => err);
        }
        return this.http.post(this.apiUrl, appointmentData);
      })
    );
  }

  closeAppointment(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/close`, {});
  }

  updateAppointmentStatus(id: number, nextStatus: ManualAppointmentStatus | string): Observable<AppointmentStatusUpdateResponse> {
    const canonicalStatus = this.normalizeAppointmentStatus(nextStatus);
    const requestOptions = {
      responseType: 'text' as const,
    };

    const url = `${this.apiUrl}/${id}/status`;
    const body = { status: canonicalStatus };

    return this.http.patch(url, body, requestOptions).pipe(
      map((response) => this.parseStatusUpdateResponse(response, canonicalStatus)),
      catchError((err) => {
        const status = (err as { status?: number } | null)?.status;
        if (status === 400 || status === 401 || status === 403) {
          return throwError(() => err);
        }
        return this.http.put(url, body, requestOptions).pipe(
          map((response) => this.parseStatusUpdateResponse(response, canonicalStatus))
        );
      }),
    );
  }

  getAppointmentStatuses(): Observable<AppointmentStatusesResponse> {
    return this.http.get<AppointmentStatusesResponse>(`${this.apiUrl}/statuses`);
  }

  openAppointment(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/open`);
  }

  updateAppointment(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/update`, payload);
  }

  deleteAppointment(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getPatients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.patientsUrl}`);
  }

  createQuickPatient(patientData: any): Observable<any> {
    return this.http.post(`${this.patientsUrl}/new`, patientData);
  }

  getPatientTreatments(patientId: number): Observable<any> {
    return this.http.get(`${this.treatmentsUrl}/patient/${patientId}`);
  }

  private normalizeAppointmentStatus(nextStatus: string): string {
    const normalized = String(nextStatus ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');

    if (normalized === 'confirmada' || normalized === 'confirmado' || normalized === 'confirmed') {
      return 'Confirmada';
    }
    if (
      normalized === 'arribada' ||
      normalized === 'arribado' ||
      normalized === 'arrived' ||
      normalized === 'arrival' ||
      normalized === 'checkedin' ||
      normalized === 'present'
    ) {
      return 'Arribada';
    }
    if (
      normalized === 'cancelada' ||
      normalized === 'cancellada' ||
      normalized === 'cancelled' ||
      normalized === 'canceled'
    ) {
      return 'Cancelada';
    }

    return String(nextStatus ?? '').trim();
  }

  private parseStatusUpdateResponse(response: string, fallbackStatus: string): AppointmentStatusUpdateResponse {
    const trimmed = String(response ?? '').trim();
    if (!trimmed) {
      return { status: fallbackStatus };
    }

    try {
      const parsed = JSON.parse(trimmed) as AppointmentStatusUpdateResponse | string;
      if (typeof parsed === 'string') {
        return { status: parsed || fallbackStatus };
      }
      return {
        ...parsed,
        status: parsed.status ?? parsed.appointment?.status ?? fallbackStatus,
      };
    } catch {
      return { status: fallbackStatus };
    }
  }

  /**
   * Historial de citas por paciente con fallback de rutas/filtros para APIs heterogeneas.
   */
  listByPatientId(patientId: number): Observable<unknown[]> {
    const idStr = String(patientId);

    const fromPatientSubresource = this.http
      .get<unknown>(`${this.patientsUrl}/${patientId}/appointments`)
      .pipe(map(extractApiCollection));

    const fromAppointmentIndex = this.http
      .get<unknown>(`${this.apiUrl}/index`, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(extractApiCollection));

    const fromAppointmentsPlural = this.http
      .get<unknown>(`${environment.apiBaseUrl}/api/appointments`, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(extractApiCollection));

    return fromPatientSubresource.pipe(
      catchError(() =>
        fromAppointmentIndex.pipe(
          catchError(() => fromAppointmentsPlural),
          catchError((err: unknown) => throwError(() => err))
        )
      )
    );
  }
}
