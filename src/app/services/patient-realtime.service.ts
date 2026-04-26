import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject, fromEvent, interval, merge, of } from 'rxjs';
import { map, share } from 'rxjs/operators';

export type PatientRealtimeEvent =
  | { kind: 'heartbeat' }
  | { kind: 'patient-mutated'; action: 'created' | 'updated' | 'deleted'; patientId?: number }
  | { kind: 'document-mutated'; action: 'created' | 'updated' | 'deleted'; patientId?: number; documentId?: number };

@Injectable({ providedIn: 'root' })
export class PatientRealtimeService {
  private readonly localEvents$ = new Subject<PatientRealtimeEvent>();
  private readonly changesStream: Observable<PatientRealtimeEvent>;
  private readonly channel: BroadcastChannel | null;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    const isBrowser = isPlatformBrowser(platformId);
    if (!isBrowser) {
      this.channel = null;
      this.changesStream = this.localEvents$.asObservable().pipe(share());
      return;
    }

    this.channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('falconcare-patient-realtime')
      : null;

    const channelEvents$ = this.channel
      ? fromEvent<MessageEvent<PatientRealtimeEvent>>(this.channel, 'message').pipe(
          map((event) => event.data)
        )
      : of<PatientRealtimeEvent>();

    const focusEvents$ = fromEvent(window, 'focus').pipe(
      map(() => ({ kind: 'heartbeat' } as PatientRealtimeEvent))
    );
    const heartbeat$ = interval(10_000).pipe(
      map(() => ({ kind: 'heartbeat' } as PatientRealtimeEvent))
    );

    this.changesStream = merge(this.localEvents$, channelEvents$, focusEvents$, heartbeat$).pipe(share());
  }

  get changes$(): Observable<PatientRealtimeEvent> {
    return this.changesStream;
  }

  publishMutation(action: 'created' | 'updated' | 'deleted', patientId?: number): void {
    const event: PatientRealtimeEvent = { kind: 'patient-mutated', action, patientId };
    this.localEvents$.next(event);
    this.channel?.postMessage(event);
  }

  publishDocumentMutation(
    action: 'created' | 'updated' | 'deleted',
    patientId?: number,
    documentId?: number
  ): void {
    const event: PatientRealtimeEvent = { kind: 'document-mutated', action, patientId, documentId };
    this.localEvents$.next(event);
    this.channel?.postMessage(event);
  }
}
