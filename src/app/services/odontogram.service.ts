import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concatMap, first, from, map, of, switchMap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { PatientService } from './patient.service';
import { AppointmentService } from './appointment.service';

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

type FixedOdontogramContext = {
  patientId: number;
  visitId: number;
};

@Injectable({ providedIn: 'root' })
export class OdontogramService {
  private readonly http = inject(HttpClient);
  private readonly patientService = inject(PatientService);
  private readonly appointmentService = inject(AppointmentService);
  private readonly odontogramsUrl = `${environment.apiBaseUrl}/api/odontograms`;

  openFixedOdontogram(): Observable<OpenOdontogramResponse> {
    return this.resolveFixedContext().pipe(
      switchMap(({ patientId, visitId }) =>
        this.http.post<OpenOdontogramResponse>(`${this.odontogramsUrl}/open`, {
          patient_id: patientId,
          visit_id: visitId,
        })
      )
    );
  }

  syncDetails(odontogramId: number, entries: SyncOdontogramEntry[]): Observable<SyncOdontogramResponse> {
    return this.http.post<SyncOdontogramResponse>(`${this.odontogramsUrl}/${odontogramId}/details/sync`, {
      entries,
    });
  }

  private resolveFixedContext(): Observable<FixedOdontogramContext> {
    return this.patientService.list().pipe(
      switchMap((patients) => {
        const validPatients = patients.filter(
          (patient): patient is { id: number } => typeof patient.id === 'number' && Number.isFinite(patient.id)
        );

        if (validPatients.length === 0) {
          return throwError(() => new Error('No patients available to initialize the fixed odontogram.'));
        }

        return from(validPatients).pipe(
          concatMap((patient) =>
            this.appointmentService.listByPatientId(patient.id).pipe(
              map((appointments) => {
                const visitId = this.extractFirstAppointmentId(appointments);

                return visitId
                  ? {
                      patientId: patient.id,
                      visitId,
                    }
                  : null;
              })
            )
          ),
          first((context): context is FixedOdontogramContext => context !== null, null),
          switchMap((context) =>
            context
              ? of(context)
              : throwError(() => new Error('No appointments available to initialize the fixed odontogram.'))
          )
        );
      })
    );
  }

  private extractFirstAppointmentId(rows: unknown[]): number | null {
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        continue;
      }

      const id = Number((row as Record<string, unknown>)['id']);
      if (Number.isFinite(id) && id >= 1) {
        return id;
      }
    }

    return null;
  }
}
