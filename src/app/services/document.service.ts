import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';
import { Document } from '../models/document.model';
import { normalizeApiBaseUrl } from '../utils/api-base-url.util';
import { PatientRealtimeService } from './patient-realtime.service';

export type CreateDocumentPayload = {
  file: File;
  patientId: number;
  /** MIME u `application/octet-stream`; opcional si el back infiere solo por fichero. */
  type?: string;
  description?: string;
};

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly apiBase = normalizeApiBaseUrl(environment.apiBaseUrl);
  private readonly baseUrl = `${this.apiBase}/api/documents`;

  constructor(
    private readonly http: HttpClient,
    private readonly patientRealtime: PatientRealtimeService
  ) {}

  /**
   * IRI absoluta del paciente (obligatoria en POST `patient`).
   * Debe coincidir con la base que el servidor usa al validar IRI (`API_BASE_URL`).
   */
  private patientResourceIri(patientId: number): string {
    return `${this.apiBase}/api/patients/${patientId}`;
  }

  /**
   * Documentos del paciente (orden de reintentos si falla el anterior).
   * Alineado con `DocumentApiController` / `PatientApiController` Symfony (sin API Platform en composer).
   *
   * 1) GET `/api/patients/{id}/documents`
   * 2) GET `/api/documents?patientId=`
   * 3) GET `/api/documents?patient.id=`
   * 4) GET `/api/documents?patient_id=`
   * 5) GET `/api/documents?patient[id]=`
   * 6) GET `/api/documents?patient=` (IRI absoluta `{apiBase}/api/patients/{id}`)
   *
   * `GET /api/documents` sin filtro de paciente → 400 en servidor.
   * El cliente aplica `belongsToPatientRelation` por si la colección incluye ruido.
   */
  listByPatientId(patientId: number): Observable<unknown[]> {
    const idStr = String(patientId);
    const patientDocumentsUrl = `${this.apiBase}/api/patients/${patientId}/documents`;

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

    const byPatientBracketId = this.http
      .get<unknown>(this.baseUrl, {
        params: new HttpParams().set('patient[id]', idStr),
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
          catchError(() => byPatientBracketId),
          catchError(() => byPatientIri),
          catchError((err: unknown) => throwError(() => err))
        )
      )
    );
  }

  /**
   * Mismo criterio de filtro por paciente que `GET /api/documents` (query `patientId`, etc.).
   * Respuesta: array JSON o envoltura Hydra (`hydra:member` / `member`).
   */
  listByCaptureDate(patientId: number, date: string): Observable<Document[]> {
    const params = new HttpParams().set('patientId', String(patientId)).set('date', date);
    return this.http.get<unknown>(`${this.baseUrl}/captureDate`, { params }).pipe(
      map((body) => extractApiCollection(body) as Document[])
    );
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
    if (payload.type?.trim()) {
      form.append('type', payload.type.trim());
    }
    if (payload.description) form.append('description', payload.description);
    return this.http.post<Document>(this.baseUrl, form).pipe(
      tap((doc) => this.patientRealtime.publishDocumentMutation('created', payload.patientId, doc?.id))
    );
  }

  /**
   * Variante con eventos de progreso para UI de subida.
   */
  createWithProgress(payload: CreateDocumentPayload): Observable<HttpEvent<Document>> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('patient', this.patientResourceIri(payload.patientId));
    if (payload.type?.trim()) {
      form.append('type', payload.type.trim());
    }
    if (payload.description) form.append('description', payload.description);
    return this.http
      .post<Document>(this.baseUrl, form, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        tap((event) => {
          if (event.type !== HttpEventType.Response) {
            return;
          }
          const doc = event.body;
          this.patientRealtime.publishDocumentMutation('created', payload.patientId, doc?.id);
        })
      );
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
    return this.http
      .put<Document>(`${this.baseUrl}/${documentId}`, body, {
        params: this.patientIdQueryParams(patientId),
      })
      .pipe(tap(() => this.patientRealtime.publishDocumentMutation('updated', patientId, documentId)));
  }

  /** `DELETE /api/documents/{patientId}/{documentId}` */
  delete(patientId: number, documentId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${patientId}/${documentId}`)
      .pipe(tap(() => this.patientRealtime.publishDocumentMutation('deleted', patientId, documentId)));
  }
}

