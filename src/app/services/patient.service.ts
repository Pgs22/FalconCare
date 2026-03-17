import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Patient } from '../models/patient.model';

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
    return this.http.post<Patient>(this.baseUrl, payload);
  }

  update(id: number, payload: Partial<Patient>): Observable<Patient> {
    return this.http.put<Patient>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}

