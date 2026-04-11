import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  constructor(private http: HttpClient) { }

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
    return this.http.post(`${this.apiUrl}/new`, appointmentData);
  }

  closeAppointment(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/close`, {});
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
}