import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  from,
  map,
  mergeMap,
  of,
  switchMap,
  throwError,
  toArray,
} from 'rxjs';

import { environment } from '../../environments/environment';
import { extractApiCollection } from '../models/appointment-api.util';
import { PatientService } from './patient.service';

/** Une respuestas de varias citas y elimina duplicados por `id` numérico. */
function mergeAppointmentCollectionsDeduped(groups: readonly unknown[][]): unknown[] {
  const seen = new Set<number>();
  const out: unknown[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const id = Number((row as Record<string, unknown>)['id']);
      if (Number.isFinite(id) && id >= 1) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
      }
      out.push(row);
    }
  }
  return out;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private readonly http = inject(HttpClient);
  private readonly patientService = inject(PatientService);
  /** Colección API Platform / REST plural (`GET /api/appointments`). */
  private readonly appointmentsUrl = `${environment.apiBaseUrl}/api/appointments`;
  /** Ruta singular si el backend la expone en lugar del plural. */
  private readonly appointmentLegacyUrl = `${environment.apiBaseUrl}/api/appointment`;

  /**
   * Listado global para agenda / doctor-panel / KPIs.
   * 1) `GET /api/appointments` (colección API Platform).
   * 2) `GET /api/appointment` (singular legacy).
   * 3) Si el backend **exige filtro** (400 en colección) y no hay singular: `GET /api/patients` y
   *    una petición de citas por paciente (`listByPatientId`), deduplicando por `id`.
   */
  getAppointments(): Observable<unknown[]> {
    const fromPlural = this.http
      .get<unknown>(this.appointmentsUrl)
      .pipe(map(extractApiCollection));
    const fromSingular = this.http
      .get<unknown>(this.appointmentLegacyUrl)
      .pipe(map(extractApiCollection));
    return fromPlural.pipe(
      catchError(() => fromSingular),
      catchError(() => this.getAppointmentsAggregatedByPatients())
    );
  }

  /**
   * Cuando `/api/appointments` sin query devuelve 400 (filtro obligatorio) y no existe ruta global.
   */
  private getAppointmentsAggregatedByPatients(): Observable<unknown[]> {
    return this.patientService.list().pipe(
      switchMap((patients) => {
        const ids = patients
          .map((p) => p.id)
          .filter((id): id is number => id != null && id >= 1);
        if (ids.length === 0) {
          return of([] as unknown[]);
        }
        return from(ids).pipe(
          mergeMap(
            (id) =>
              this.listByPatientId(id).pipe(catchError(() => of([] as unknown[]))),
            8
          ),
          toArray(),
          map((groups) => mergeAppointmentCollectionsDeduped(groups))
        );
      })
    );
  }

  /**
   * Historial de citas del paciente (Symfony recomienda `?patientId=<id>`).
   * Orden de intentos: patientId → patient.id → patient (IRI) → legacy singular.
   */
  listByPatientId(patientId: number): Observable<unknown[]> {
    const idStr = String(patientId);

    const byPatientId = this.http
      .get<unknown>(this.appointmentsUrl, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(extractApiCollection));

    const byPatientDotId = this.http
      .get<unknown>(this.appointmentsUrl, {
        params: new HttpParams().set('patient.id', idStr),
      })
      .pipe(map(extractApiCollection));

    const byPatientIri = this.http
      .get<unknown>(this.appointmentsUrl, {
        params: new HttpParams().set('patient', `/api/patients/${patientId}`),
      })
      .pipe(map(extractApiCollection));

    const byLegacySingular = this.http
      .get<unknown>(this.appointmentLegacyUrl, {
        params: new HttpParams().set('patientId', idStr),
      })
      .pipe(map(extractApiCollection));

    return byPatientId.pipe(
      catchError(() => byPatientDotId),
      catchError(() => byPatientIri),
      catchError(() => byLegacySingular),
      catchError((err: unknown) => throwError(() => err))
    );
  }
}
