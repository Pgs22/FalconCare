import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type PatientRealtimeEvent =
  | { kind: 'patient-mutated'; patientId: number | null }
  | { kind: 'document-mutated'; action: 'created' | 'updated' | 'deleted'; patientId: number | null; documentId?: number };

@Injectable({ providedIn: 'root' })
export class PatientRealtimeService {
  private readonly changesSubject = new Subject<PatientRealtimeEvent>();

  readonly changes$: Observable<PatientRealtimeEvent> = this.changesSubject.asObservable();

  publishPatientMutation(patientId: number | null): void {
    this.changesSubject.next({ kind: 'patient-mutated', patientId });
  }

  publishDocumentMutation(
    action: 'created' | 'updated' | 'deleted',
    patientId: number | null,
    documentId?: number
  ): void {
    this.changesSubject.next({ kind: 'document-mutated', action, patientId, documentId });
  }
}
