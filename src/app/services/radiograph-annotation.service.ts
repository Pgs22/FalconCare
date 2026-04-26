import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';

export type RadiographAnnotationView = {
  id: number;
  documentId: number;
  patientId: number;
  appointmentId: number;
  tool: string;
  label: string;
  color: string;
  payload: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateRadiographAnnotationPayload = {
  appointmentId: number;
  tool: string;
  label?: string;
  color?: string;
  payload?: Record<string, unknown>;
};

@Injectable({ providedIn: 'root' })
export class RadiographAnnotationService {
  private readonly documentsBaseUrl = `${environment.apiBaseUrl}/api/documents`;

  constructor(private readonly http: HttpClient) {}

  list(documentId: number, patientId: number, appointmentId?: number): Observable<RadiographAnnotationView[]> {
    let params = new HttpParams().set('patientId', String(patientId));
    if (appointmentId != null) {
      params = params.set('appointmentId', String(appointmentId));
    }
    return this.http
      .get<unknown>(`${this.documentsBaseUrl}/${documentId}/annotations`, { params })
      .pipe(map(extractApiCollection), map((rows) => rows.map((row) => this.mapAnnotation(row))));
  }

  create(
    documentId: number,
    patientId: number,
    payload: CreateRadiographAnnotationPayload
  ): Observable<RadiographAnnotationView> {
    const params = new HttpParams().set('patientId', String(patientId));
    const body = {
      appointmentId: payload.appointmentId,
      tool: payload.tool,
      label: payload.label ?? null,
      color: payload.color ?? null,
      payload: payload.payload ?? {},
    };
    return this.http
      .post<unknown>(`${this.documentsBaseUrl}/${documentId}/annotations`, body, { params })
      .pipe(map((raw) => this.mapAnnotation(raw)));
  }

  update(
    documentId: number,
    annotationId: number,
    patientId: number,
    body: Record<string, unknown>
  ): Observable<RadiographAnnotationView> {
    const params = new HttpParams().set('patientId', String(patientId));
    return this.http
      .put<unknown>(`${this.documentsBaseUrl}/${documentId}/annotations/${annotationId}`, body, { params })
      .pipe(map((raw) => this.mapAnnotation(raw)));
  }

  delete(documentId: number, annotationId: number, patientId: number): Observable<void> {
    const params = new HttpParams().set('patientId', String(patientId));
    return this.http.delete<void>(`${this.documentsBaseUrl}/${documentId}/annotations/${annotationId}`, {
      params,
    });
  }

  private mapAnnotation(raw: unknown): RadiographAnnotationView {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const appointmentId = Number(row['appointmentId'] ?? row['visitId'] ?? 0);
    const payloadRaw = row['payload'] ?? row['data'] ?? {};
    const payload =
      payloadRaw && typeof payloadRaw === 'object' ? (payloadRaw as Record<string, unknown>) : {};
    return {
      id: Number(row['id'] ?? 0),
      documentId: Number(row['documentId'] ?? row['document_id'] ?? 0),
      patientId: Number(row['patientId'] ?? row['patient_id'] ?? 0),
      appointmentId: Number.isFinite(appointmentId) ? appointmentId : 0,
      tool: String(row['tool'] ?? ''),
      label: String(row['label'] ?? ''),
      color: String(row['color'] ?? ''),
      payload,
      createdAt: typeof row['createdAt'] === 'string' ? row['createdAt'] : undefined,
      updatedAt: typeof row['updatedAt'] === 'string' ? row['updatedAt'] : undefined,
    };
  }
}

