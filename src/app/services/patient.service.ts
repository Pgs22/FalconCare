import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Patient } from '../models/patient.model';

export type RegisterPatientPayload = {
  identityDocument: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  plainPassword?: string;
  address: string;
  consultationReason: string;
  familyHistory: string;
  healthStatus: string;
  lifestyleHabits: string;
  medicationAllergies: string;
  ssNumber?: string | null;
  registrationDate?: string;
};

@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/patients`;

  constructor(private readonly http: HttpClient) {}

  list(search?: string): Observable<Patient[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<Patient[]>(this.baseUrl, { params });
  }

  getById(id: number): Observable<Patient> {
    return this.http.get<Patient>(`${this.baseUrl}/${id}`);
  }

  getByIdentity(identityDocument: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.baseUrl}/by-identity/${encodeURIComponent(identityDocument)}`);
  }

  create(payload: Partial<Patient>): Observable<Patient> {
    return this.http.post<Patient>(this.baseUrl, this.toApiPatientBody(payload));
  }

  registerPatient(payload: RegisterPatientPayload): Observable<Patient> {
    return this.http.post<Patient>(this.baseUrl, this.toApiPatientBody(payload));
  }

  /** PUT parcial: `profileImage` → `profile_image` en BD Neon (Symfony/Doctrine). */
  update(id: number, payload: Partial<Patient>): Observable<Patient> {
    return this.http.put<Patient>(`${this.baseUrl}/${id}`, this.toApiPatientBody(payload));
  }

  /** PATCH parcial (mismo cuerpo que PUT si el backend lo expone). */
  patch(id: number, payload: Partial<Patient>): Observable<Patient> {
    return this.http.patch<Patient>(`${this.baseUrl}/${id}`, this.toApiPatientBody(payload));
  }

  /**
   * Mapea `medicationAllergies` → `medication_allergies` (columna Neon / Doctrine) y duplica
   * también en camelCase para APIs Symfony que esperan el nombre de la propiedad PHP.
   */
  private toApiPatientBody(payload: Partial<Patient> | RegisterPatientPayload): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) {
        continue;
      }
      if (key === 'medicationAllergies') {
        out['medication_allergies'] = value;
        out['medicationAllergies'] = value;
      } else if (key === 'profileImage') {
        // Backend: una sola clave canónica en el body (prioridad estricta en servidor).
        out['profile_image'] = value;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}

