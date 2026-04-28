import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type OdontogramPathologyTypeApi = {
  id: number | null;
  name: string | null;
};

export type OdontogramFaceApi = {
  id: number;
  face_name: string;
};

export type OdontogramDetailApi = {
  id: number;
  odontogram_id: number;
  tooth_number: number;
  pathology: {
    id: number | null;
    description: string | null;
    protocol_color: string | null;
    visual_type: string | null;
    pathology_type: OdontogramPathologyTypeApi | null;
  } | null;
  faces: OdontogramFaceApi[];
};

export type OdontogramApi = {
  id: number;
  status: string;
  visit_id: number | null;
  patient_id: number | null;
  treatment_id: number | null;
  details: OdontogramDetailApi[];
};

export type OpenOdontogramResponse = {
  message: string;
  odontogram: OdontogramApi;
};

export type SyncOdontogramEntry = {
  tooth_number: number;
  pathology_type_id: number;
  faces: string[];
};

export type SyncOdontogramResponse = {
  message: string;
  odontogram: OdontogramApi;
};

@Injectable({ providedIn: 'root' })
export class OdontogramService {
  private readonly http = inject(HttpClient);
  private readonly odontogramsUrl = `${environment.apiBaseUrl}/api/odontograms`;

  openOdontogram(patientId: number, visitId: number): Observable<OpenOdontogramResponse> {
    return this.http.post<OpenOdontogramResponse>(`${this.odontogramsUrl}/open`, {
      patient_id: patientId,
      visit_id: visitId,
    });
  }

  syncDetails(odontogramId: number, entries: SyncOdontogramEntry[]): Observable<SyncOdontogramResponse> {
    return this.http.post<SyncOdontogramResponse>(`${this.odontogramsUrl}/${odontogramId}/details/sync`, {
      entries,
    });
  }
}
