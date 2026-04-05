import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Appointment {
  id: number;
  time: string;
  duration: number;
  status: string;
  patientName: string;
  doctorName: string;
  box: string;
  reason: string;
  isFirstVisit?: boolean; 
  isUrgency?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private apiUrl = 'http://localhost:8000/api/appointment';
  private patientsUrl = 'http://localhost:8000/api/patients';

  constructor(private http: HttpClient) { }

  getAppointments(date?: string): Observable<Appointment[]> {
    const url = date ? `${this.apiUrl}/index?date=${date}` : `${this.apiUrl}/index`;
    return this.http.get<Appointment[]>(url);
  }

  getSetupFormData(): Observable<{doctors: any[], boxes: any[]}> {
    return this.http.get<{doctors: any[], boxes: any[]}>(`${this.apiUrl}/setup-appointment-form`);
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
}