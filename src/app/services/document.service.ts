import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Document } from '../models/document.model';

export type CreateDocumentPayload = {
  file: File;
  patientId: number; // el backend espera "patient" (id) en FormData
  type: string;
  description?: string;
};

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/documents`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Document[]> {
    return this.http.get<Document[]>(this.baseUrl);
  }

  listByCaptureDate(date: string): Observable<Document[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<Document[]>(`${this.baseUrl}/captureDate`, { params });
  }

  getById(id: number): Observable<Document> {
    return this.http.get<Document>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateDocumentPayload): Observable<Document> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('patient', String(payload.patientId));
    form.append('type', payload.type);
    if (payload.description) form.append('description', payload.description);
    return this.http.post<Document>(this.baseUrl, form);
  }

  download(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/download`, { responseType: 'blob' });
  }
}

