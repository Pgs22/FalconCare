import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { extractApiCollection } from '../models/appointment-api.util';

export interface Appointment {
  id: number;
  time: string;
  duration: number;
  cleaningTime: number;
  totalBlockTime: number;
  status: string;
  patientName: string;
  doctorName: string;
  boxId: number | null;
  box: string;
  reason: string;
  color: string;
  isUrgency?: boolean;
  isFirstVisit?: boolean; 
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  
  private apiUrl = 'http://localhost:8000/api/appointment';
  private patientsUrl = 'http://localhost:8000/api/patients';
  private treatmentsUrl = 'http://localhost:8000/api/treatments';

  constructor(private http: HttpClient) {}

  getAppointments(date?: string): Observable<Appointment[]> {
    const url = date ? `${this.apiUrl}/index?date=${date}` : `${this.apiUrl}/index`;
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
    return this.http.post(`${this.apiUrl}/new`, appointmentData, { withCredentials: true });
  }

  closeAppointment(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/close`, {}, { withCredentials: true });
  }

  updateAppointmentStatus(id: number, nextStatus: string): Observable<string> {
    const canonicalStatus = this.normalizeAppointmentStatus(nextStatus);

    const requestOptions = {
      withCredentials: true,
      responseType: 'text' as const,
    };

    const url = `${this.apiUrl}/${id}/status`;
    const stringBody = canonicalStatus;

    return this.http.patch(url, stringBody, requestOptions).pipe(
      catchError(() => this.http.put(url, stringBody, requestOptions)),
    );
  }

  openAppointment(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/open`, { withCredentials: true });
  }

  updateAppointment(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/update`, payload, { withCredentials: true }).pipe(
      catchError(() => this.http.put(`${this.apiUrl}/${id}/update`, payload, { withCredentials: true })),
      catchError(() => this.http.post(`${this.apiUrl}/${id}/update`, payload, { withCredentials: true }))
    );
  }

  deleteAppointment(id: number): Observable<any> {
    const opts = { withCredentials: true };

    return this.http.delete(`${this.apiUrl}/${id}`, opts);
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

    if (normalized === 'programada' || normalized === 'programado' || normalized === 'scheduled') {
      return 'Programada';
    }
    if (normalized === 'confirmada' || normalized === 'confirmado' || normalized === 'confirmed') {
      return 'Confirmada';
    }
    if (normalized === 'encurs' || normalized === 'encurso' || normalized === 'inprogress') {
      return 'En curs';
    }
    if (
      normalized === 'cancelada' ||
      normalized === 'cancellada' ||
      normalized === 'cancelled' ||
      normalized === 'canceled'
    ) {
      return 'Cancel·lada';
    }
    if (normalized === 'finalitzada' || normalized === 'finalizada' || normalized === 'finished') {
      return 'Finalitzada';
    }
    if (normalized === 'faltaconsentiment' || normalized === 'faltaconsentimiento') {
      return 'Falta Consentiment';
    }

    return 'Programada';
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
      .get<unknown>('http://localhost:8000/api/appointments', {
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