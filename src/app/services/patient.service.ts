import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  buildAllergiesBitmask,
  Patient,
} from '../models/patient.model';
import { PatientRealtimeService } from './patient-realtime.service';

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
  allergiesBitmask?: number;
  selectedAllergies?: number[];
  ssNumber?: string | null;
  registrationDate?: string;
};

@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/patients`;

  constructor(
    private readonly http: HttpClient,
    private readonly patientRealtime: PatientRealtimeService
  ) {}

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
    return this.http.post<Patient>(this.baseUrl, this.toApiPatientBody(payload)).pipe(
      tap((patient) => this.patientRealtime.publishMutation('created', patient?.id))
    );
  }

  registerPatient(payload: RegisterPatientPayload): Observable<Patient> {
    return this.http.post<Patient>(this.baseUrl, this.toApiPatientBody(payload)).pipe(
      tap((patient) => this.patientRealtime.publishMutation('created', patient?.id))
    );
  }

  /** PUT parcial: `profileImage` → `profile_image` en BD Neon (Symfony/Doctrine). */
  update(id: number, payload: Partial<Patient>): Observable<Patient> {
    return this.http.put<Patient>(`${this.baseUrl}/${id}`, this.toApiPatientBody(payload)).pipe(
      tap(() => this.patientRealtime.publishMutation('updated', id))
    );
  }

  /** PATCH parcial (mismo cuerpo que PUT si el backend lo expone). */
  patch(id: number, payload: Partial<Patient>): Observable<Patient> {
    return this.http.patch<Patient>(`${this.baseUrl}/${id}`, this.toApiPatientBody(payload)).pipe(
      tap(() => this.patientRealtime.publishMutation('updated', id))
    );
  }

  /**
   * Mapea `medicationAllergies` → `medication_allergies` (columna Neon / Doctrine) y duplica
   * también en camelCase para APIs Symfony que esperan el nombre de la propiedad PHP.
   */
  private toApiPatientBody(payload: Partial<Patient> | RegisterPatientPayload): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const selectedAllergies = this.normalizeSelectedAllergies(
      (payload as Partial<Patient> | RegisterPatientPayload).selectedAllergies
    );
    const allergiesBitmask = this.normalizeAllergiesBitmask(
      (payload as Partial<Patient> | RegisterPatientPayload).allergiesBitmask,
      selectedAllergies
    );

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
      } else if (key === 'selectedAllergies') {
        out['selectedAllergies'] = selectedAllergies;
      } else if (key === 'allergiesBitmask') {
        out['allergiesBitmask'] = allergiesBitmask;
      } else {
        out[key] = value;
      }
    }

    if (selectedAllergies.length > 0 && out['selectedAllergies'] == null) {
      out['selectedAllergies'] = selectedAllergies;
    }
    if (allergiesBitmask != null && out['allergiesBitmask'] == null) {
      out['allergiesBitmask'] = allergiesBitmask;
    }

    return out;
  }

  private normalizeSelectedAllergies(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  private normalizeAllergiesBitmask(value: unknown, selectedAllergies: number[]): number | undefined {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    if (selectedAllergies.length > 0) {
      return buildAllergiesBitmask(selectedAllergies);
    }
    if (numeric != null) {
      return numeric;
    }
    return undefined;
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => this.patientRealtime.publishMutation('deleted', id))
    );
  }
}

