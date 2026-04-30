import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';

type ApiRecord = Record<string, unknown>;

export type RadiographAnnotationView = {
  id: number;
  label: string;
  color: string;
  tool: string;
  payload: Record<string, unknown>;
  appointmentId: number | null;
  createdAt: string;
  updatedAt: string;
};

type CreateRadiographAnnotationPayload = {
  appointmentId: number;
  tool: string;
  label: string;
  color: string;
  payload: Record<string, unknown>;
};

type UpdateRadiographAnnotationPayload = {
  label: string;
  color: string;
  payload: Record<string, unknown>;
};

@Injectable({ providedIn: 'root' })
export class RadiographAnnotationService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/radiograph-annotations`;

  constructor(private readonly http: HttpClient) {}

  list(documentId: number, patientId: number, appointmentId: number): Observable<RadiographAnnotationView[]> {
    const params = new HttpParams()
      .set('documentId', String(documentId))
      .set('patientId', String(patientId))
      .set('appointmentId', String(appointmentId));

    return this.http
      .get<unknown>(this.baseUrl, { params })
      .pipe(map(extractApiCollection), map((rows) => rows.map((row) => this.toView(row)).filter((x): x is RadiographAnnotationView => x != null)));
  }

  create(
    documentId: number,
    patientId: number,
    payload: CreateRadiographAnnotationPayload
  ): Observable<RadiographAnnotationView> {
    const body = {
      ...payload,
      documentId,
      patientId,
    };

    return this.http.post<unknown>(this.baseUrl, body).pipe(
      map((row) => this.toView(row)),
      map((row) => {
        if (!row) {
          throw new Error('Invalid radiograph annotation response.');
        }
        return row;
      })
    );
  }

  update(
    documentId: number,
    annotationId: number,
    patientId: number,
    payload: UpdateRadiographAnnotationPayload
  ): Observable<RadiographAnnotationView> {
    const body = {
      ...payload,
      documentId,
      patientId,
    };

    return this.http.put<unknown>(`${this.baseUrl}/${annotationId}`, body).pipe(
      map((row) => this.toView(row)),
      map((row) => {
        if (!row) {
          throw new Error('Invalid radiograph annotation response.');
        }
        return row;
      })
    );
  }

  delete(documentId: number, annotationId: number, patientId: number): Observable<void> {
    const params = new HttpParams()
      .set('documentId', String(documentId))
      .set('patientId', String(patientId));
    return this.http.delete<void>(`${this.baseUrl}/${annotationId}`, { params });
  }

  private toView(raw: unknown): RadiographAnnotationView | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const row = raw as ApiRecord;
    const id = Number(row['id']);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }

    const payloadValue = row['payload'];
    const payload = payloadValue && typeof payloadValue === 'object' ? (payloadValue as Record<string, unknown>) : {};
    const appointmentIdRaw = row['appointmentId'] ?? row['appointment_id'];
    const appointmentId = Number.isFinite(Number(appointmentIdRaw)) ? Number(appointmentIdRaw) : null;

    return {
      id,
      label: this.pickString(row, ['label']) || 'Anotación',
      color: this.pickString(row, ['color']) || '#00d4db',
      tool: this.pickString(row, ['tool']) || 'measure',
      payload,
      appointmentId,
      createdAt: this.pickString(row, ['createdAt', 'created_at']) || new Date(0).toISOString(),
      updatedAt: this.pickString(row, ['updatedAt', 'updated_at']) || new Date(0).toISOString(),
    };
  }

  private pickString(source: ApiRecord, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }
}
