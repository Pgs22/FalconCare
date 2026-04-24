import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  buildAllergiesBitmask,
  Patient,
} from '../models/patient.model';
import { RealtimeSyncService } from './realtime-sync.service';

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
  private readonly appointmentBaseUrl = `${environment.apiBaseUrl}/api/appointment`;
  private readonly appointmentPluralUrl = `${environment.apiBaseUrl}/api/appointments`;
  private readonly allergyLabelByFlag: Record<number, string> = {
    1: 'PENICILINA',
    2: 'LATEX',
    4: 'ANESTESIA',
    8: 'AINES',
  };

  constructor(
    private readonly http: HttpClient,
    private readonly realtimeSync: RealtimeSyncService
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
    const prepared = this.toApiPatientBody(payload);
    if (!prepared.ok) {
      return throwError(() => new Error(prepared.error));
    }
    return this.http.post<Patient>(this.baseUrl, prepared.body).pipe(
      tap(() => this.emitPatientSyncEvents(prepared.body))
    );
  }

  registerPatient(payload: RegisterPatientPayload): Observable<Patient> {
    const prepared = this.toApiPatientBody(payload);
    if (!prepared.ok) {
      return throwError(() => new Error(prepared.error));
    }
    return this.http.post<Patient>(this.baseUrl, prepared.body).pipe(
      tap(() => this.emitPatientSyncEvents(prepared.body))
    );
  }

  /** PUT parcial: `profileImage` → `profile_image` en BD Neon (Symfony/Doctrine). */
  update(id: number, payload: Partial<Patient>): Observable<Patient> {
    const prepared = this.toApiPatientBody(payload);
    if (!prepared.ok) {
      return throwError(() => new Error(prepared.error));
    }
    const body = prepared.body;
    return this.http.put<Patient>(`${this.baseUrl}/${id}`, body).pipe(
      tap(() => this.emitPatientSyncEvents(body))
    );
  }

  /** PATCH parcial (mismo cuerpo que PUT si el backend lo expone). */
  patch(id: number, payload: Partial<Patient>): Observable<Patient> {
    const prepared = this.toApiPatientBody(payload);
    if (!prepared.ok) {
      return throwError(() => new Error(prepared.error));
    }
    const body = prepared.body;
    return this.http.patch<Patient>(`${this.baseUrl}/${id}`, body).pipe(
      tap(() => this.emitPatientSyncEvents(body))
    );
  }

  getAppointments(id: number): Observable<unknown[]> {
    const idStr = String(id);
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const fromPatientSubresource = this.http
      .get<unknown>(`${this.baseUrl}/${id}/appointments`)
      .pipe(map(this.extractApiCollection));
    const fromAppointmentIndex = this.http
      .get<unknown>(`${this.appointmentBaseUrl}/index`, {
        params: new HttpParams().set('patientId', idStr).set('date', day),
      })
      .pipe(map(this.extractApiCollection));
    const fromAppointmentsPlural = this.http
      .get<unknown>(this.appointmentPluralUrl, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(this.extractApiCollection));
    return fromPatientSubresource.pipe(
      catchError(() =>
        fromAppointmentIndex.pipe(
          catchError(() => fromAppointmentsPlural),
          catchError((err: unknown) => throwError(() => err))
        )
      )
    );
  }

  /**
   * Mapea `medicationAllergies` → `medication_allergies` (columna Neon / Doctrine) y duplica
   * también en camelCase para APIs Symfony que esperan el nombre de la propiedad PHP.
   */
  private toApiPatientBody(
    payload: Partial<Patient> | RegisterPatientPayload
  ): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
    const out: Record<string, unknown> = {};
    const input = payload as Partial<Patient> & Record<string, unknown>;
    const selectedAllergiesRaw = input.selectedAllergies ?? input['selected_allergies'];
    const bitmaskRaw = input.allergiesBitmask ?? input['allergies_bitmask'];
    const camelTextRaw = input.medicationAllergies;
    const snakeTextRaw = input['medication_allergies'];
    const hasAllergyInput =
      camelTextRaw !== undefined ||
      snakeTextRaw !== undefined ||
      selectedAllergiesRaw !== undefined ||
      bitmaskRaw !== undefined;
    const normalizedCamel = this.normalizeAllergyText(camelTextRaw);
    const normalizedSnake = this.normalizeAllergyText(snakeTextRaw);
    if (normalizedCamel && normalizedSnake && normalizedCamel !== normalizedSnake) {
      return {
        ok: false,
        error: 'medicationAllergies and medication_allergies must match when both are provided',
      };
    }
    let selectedAllergies = this.normalizeSelectedAllergies(selectedAllergiesRaw);
    let allergiesBitmask = this.normalizeAllergiesBitmask(bitmaskRaw, selectedAllergies);
    let normalizedText = normalizedCamel || normalizedSnake;
    if (!normalizedText && selectedAllergies.length > 0) {
      normalizedText = this.flagsToCanonicalAllergyText(selectedAllergies);
    }

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

    if (hasAllergyInput) {
      out['medicationAllergies'] = normalizedText;
      out['medication_allergies'] = normalizedText;
      out['selectedAllergies'] = selectedAllergies;
      out['selected_allergies'] = selectedAllergies;
      out['allergiesBitmask'] = allergiesBitmask ?? 0;
      out['allergies_bitmask'] = allergiesBitmask ?? 0;
    } else {
      if (selectedAllergies.length > 0 && out['selectedAllergies'] == null) {
        out['selectedAllergies'] = selectedAllergies;
      }
      if (allergiesBitmask != null && out['allergiesBitmask'] == null) {
        out['allergiesBitmask'] = allergiesBitmask;
      }
    }
    return { ok: true, body: out };
  }

  private normalizeSelectedAllergies(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  private normalizeAllergyText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    const placeholders = new Set(['n/a', 'none', 'sin alergias', 'cap coneguda', 'no known allergies']);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const piece of value.split(/[,;|/]/)) {
      const trimmed = piece.trim();
      if (!trimmed) {
        continue;
      }
      const lower = trimmed.toLocaleLowerCase('es-ES');
      if (placeholders.has(lower)) {
        continue;
      }
      const normalized = trimmed
        .toLocaleUpperCase('es-ES')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    }
    return out.join(', ');
  }

  private flagsToCanonicalAllergyText(flags: number[]): string {
    return flags
      .map((flag) => this.allergyLabelByFlag[flag])
      .filter((label): label is string => !!label)
      .join(', ');
  }

  private extractApiCollection = (body: unknown): unknown[] => {
    if (Array.isArray(body)) {
      return body;
    }
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (Array.isArray(o['hydra:member'])) {
        return o['hydra:member'] as unknown[];
      }
      if (Array.isArray(o['member'])) {
        return o['member'] as unknown[];
      }
    }
    return [];
  };

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
      tap(() => this.realtimeSync.emit('patients.changed'))
    );
  }

  private emitPatientSyncEvents(body: Record<string, unknown>): void {
    this.realtimeSync.emit('patients.changed');
    const touchedAllergies =
      body['medication_allergies'] != null ||
      body['medicationAllergies'] != null ||
      body['selectedAllergies'] != null ||
      body['allergiesBitmask'] != null;
    if (touchedAllergies) {
      this.realtimeSync.emit('allergies.changed');
    }
  }
}

