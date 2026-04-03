import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Definition of the appointment structure according to Symfony serialization
export interface Appointment {
  id: number;
  time: string;
  duration: number;
  status: string;
  patientName: string;
  doctorName: string;
  box: string;
  reason: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private apiUrl = 'http://localhost:8000/api/appointment';

  constructor(private http: HttpClient) { }

  // Fetches appointments for a specific date (or today by default)
  // Recull les cites per a una data concreta
  getAppointments(date?: string): Observable<Appointment[]> {
    const url = date ? `${this.apiUrl}/index?date=${date}` : `${this.apiUrl}/index`;
    return this.http.get<Appointment[]>(url);
  }

  // Gets doctors and boxes to populate the creation form
  // Obté les dades per emplenar els desplegables (Doctors i Boxes)
  getSetupFormData(): Observable<{doctors: any[], boxes: any[]}> {
    return this.http.get<{doctors: any[], boxes: any[]}>(`${this.apiUrl}/setup-appointment-form`);
  }

  // Sends the new appointment data to Symfony
  // Crida a l'endpoint de Symfony per crear una nova cita
  createAppointment(appointmentData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/new`, appointmentData);
  }

  // Marks an appointment as 'Finalizada'
  // Finalitza la cita canviant l'estat
  closeAppointment(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/close`, {});
  }
}