import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';
import { Document } from '../models/document.model';

export type CreateDocumentPayload = {
  file: File;
  patientId: number;
  type: string;
  description?: string;
};

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/documents`;

  constructor(private readonly http: HttpClient) {}

  /** IRI absoluto del `Patient` en API Platform (necesario con front en otro origen que `/api/...` relativo). */
  private patientResourceIri(patientId: number): string {
    return `${environment.apiBaseUrl}/api/patients/${patientId}`;
  }

  /**
   * Documentos del paciente (orden de reintentos si falla el anterior):
   * 1) GET `/api/patients/{id}/documents`
   * 2) GET `/api/documents?patientId=`
   * 3) GET `/api/documents?patient.id=`
   * 4) GET `/api/documents?patient_id=`
   * 5) GET `/api/documents?patient=` (IRI absoluta `{apiBaseUrl}/api/patients/{id}`)
   *
   * El panel aplica además `belongsToPatientRelationStrict` en cliente.
   */
  listByPatientId(patientId: number): Observable<unknown[]> {
    const idStr = String(patientId);
    const patientDocumentsUrl = `${environment.apiBaseUrl}/api/patients/${patientId}/documents`;

    const fromPatientSubresource = this.http
      .get<unknown>(patientDocumentsUrl)
      .pipe(map(extractApiCollection));

    const byPatientId = this.http
      .get<unknown>(this.baseUrl, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(extractApiCollection));

    const byPatientDotId = this.http
      .get<unknown>(this.baseUrl, {
        params: new HttpParams().set('patient.id', idStr),
      })
      .pipe(map(extractApiCollection));

    const byPatientUnderscoreId = this.http
      .get<unknown>(this.baseUrl, {
        params: new HttpParams().set('patient_id', idStr),
      })
      .pipe(map(extractApiCollection));

    const byPatientIri = this.http
      .get<unknown>(this.baseUrl, {
        params: new HttpParams().set('patient', this.patientResourceIri(patientId)),
      })
      .pipe(map(extractApiCollection));

    return fromPatientSubresource.pipe(
      catchError(() =>
        byPatientId.pipe(
          catchError(() => byPatientDotId),
          catchError(() => byPatientUnderscoreId),
          catchError(() => byPatientIri),
          catchError((err: unknown) => throwError(() => err))
        )
      )
    );
  }

  listByCaptureDate(date: string): Observable<Document[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<Document[]>(`${this.baseUrl}/captureDate`, { params });
  }

  private patientIdQueryParams(patientId: number): HttpParams {
    return new HttpParams().set('patientId', String(patientId));
  }

  /**
   * Metadatos del documento. El backend exige `?patientId=` coherente con el dueño del recurso.
   */
  getById(documentId: number, patientId: number): Observable<Document> {
    return this.http.get<Document>(`${this.baseUrl}/${documentId}`, {
      params: this.patientIdQueryParams(patientId),
    });
  }

  create(payload: CreateDocumentPayload): Observable<Document> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('patient', this.patientResourceIri(payload.patientId));
    form.append('type', payload.type);
    if (payload.description) form.append('description', payload.description);
    return this.http.post<Document>(this.baseUrl, form);
  }

  /**
   * Descarga binaria. Query obligatoria `patientId` (mismo id que en la ruta del panel del paciente).
   */
  download(documentId: number, patientId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${documentId}/download`, {
      responseType: 'blob',
      params: this.patientIdQueryParams(patientId),
    });
  }

  /**
   * Actualización parcial vía PUT; `patientId` en query debe coincidir con el documento.
   */
  update(documentId: number, patientId: number, body: Record<string, unknown>): Observable<Document> {
    return this.http.put<Document>(`${this.baseUrl}/${documentId}`, body, {
      params: this.patientIdQueryParams(patientId),
    });
  }

  /** `DELETE /api/documents/{patientId}/{documentId}` */
  delete(patientId: number, documentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${patientId}/${documentId}`);
  }
}

