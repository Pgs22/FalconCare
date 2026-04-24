import { Injectable } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { environment } from '../../environments/environment';

export type SyncTopic =
  | 'appointments.changed'
  | 'patients.changed'
  | 'allergies.changed';

export interface SyncEvent {
  readonly topic: SyncTopic;
  readonly at: number;
  readonly source: string;
}

@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
  private readonly sourceId = `ui-${Math.random().toString(36).slice(2, 10)}`;
  private readonly events$ = new Subject<SyncEvent>();
  private readonly channel = this.initBroadcastChannel();
  private readonly storageKey = 'falconcare_sync_event';
  private readonly sseUrl = environment.syncEventsUrl;
  private sse: EventSource | null = null;
  private sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private sseBackoffMs = 1500;

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key !== this.storageKey || !event.newValue) {
        return;
      }
      this.consumeSerializedEvent(event.newValue);
    });
    this.connectServerEvents();
  }

  stream(topics?: readonly SyncTopic[]): Observable<SyncEvent> {
    if (!topics || topics.length === 0) {
      return this.events$.asObservable();
    }
    const accepted = new Set(topics);
    return this.events$.pipe(filter((event) => accepted.has(event.topic)));
  }

  emit(topic: SyncTopic): void {
    const event: SyncEvent = {
      topic,
      at: Date.now(),
      source: this.sourceId,
    };
    this.events$.next(event);
    this.publish(event);
  }

  private publish(event: SyncEvent): void {
    const raw = JSON.stringify(event);
    if (this.channel) {
      this.channel.postMessage(raw);
      return;
    }
    try {
      localStorage.setItem(this.storageKey, raw);
      localStorage.removeItem(this.storageKey);
    } catch {
      // Storage unavailable: same-tab event already emitted.
    }
  }

  private initBroadcastChannel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') {
      return null;
    }
    const channel = new BroadcastChannel('falconcare-sync');
    channel.onmessage = (message: MessageEvent<string>) => {
      if (typeof message.data !== 'string') {
        return;
      }
      this.consumeSerializedEvent(message.data);
    };
    return channel;
  }

  private consumeSerializedEvent(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as Partial<SyncEvent>;
      if (!parsed?.topic || !parsed?.source || parsed.source === this.sourceId) {
        return;
      }
      if (
        parsed.topic !== 'appointments.changed' &&
        parsed.topic !== 'patients.changed' &&
        parsed.topic !== 'allergies.changed'
      ) {
        return;
      }
      this.events$.next({
        topic: parsed.topic,
        at: Number(parsed.at) || Date.now(),
        source: parsed.source,
      });
    } catch {
      // Ignore malformed payloads.
    }
  }

  private connectServerEvents(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !this.sseUrl) {
      return;
    }
    try {
      this.sse = new EventSource(this.sseUrl, { withCredentials: true });
      this.sse.onopen = () => {
        this.sseBackoffMs = 1500;
      };
      this.sse.onmessage = (message: MessageEvent<string>) => {
        if (typeof message.data !== 'string' || !message.data.trim()) {
          return;
        }
        this.consumeServerMessage(message.data);
      };
      this.sse.onerror = () => {
        this.reconnectServerEvents();
      };
    } catch {
      this.reconnectServerEvents();
    }
  }

  private reconnectServerEvents(): void {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    if (this.sseRetryTimer) {
      return;
    }
    const waitMs = this.sseBackoffMs;
    this.sseBackoffMs = Math.min(this.sseBackoffMs * 2, 30_000);
    this.sseRetryTimer = setTimeout(() => {
      this.sseRetryTimer = null;
      this.connectServerEvents();
    }, waitMs);
  }

  private consumeServerMessage(raw: string): void {
    try {
      const topics = this.mapTopicsFromServerPayload(raw);
      for (const topic of topics) {
        this.events$.next({
          topic,
          at: Date.now(),
          source: 'server',
        });
      }
    } catch {
      // Ignore non-JSON heartbeat/event frames.
    }
  }

  mapTopicsFromServerPayload(raw: string): SyncTopic[] {
    const parsed = JSON.parse(raw) as
      | Partial<SyncEvent>
      | { topic?: string; topics?: string[]; entity?: string; type?: string };
    const topics: string[] = [];
    if (typeof (parsed as { topic?: string }).topic === 'string') {
      topics.push((parsed as { topic: string }).topic);
    }
    if (Array.isArray((parsed as { topics?: string[] }).topics)) {
      topics.push(...((parsed as { topics: string[] }).topics));
    }
    const entity = String((parsed as { entity?: string }).entity ?? '').toLowerCase();
    const eventType = String((parsed as { type?: string }).type ?? '').toLowerCase();
    if (entity.includes('appointment') || eventType.includes('appointment')) {
      topics.push('appointments.changed');
    }
    if (entity.includes('patient') || eventType.includes('patient')) {
      topics.push('patients.changed');
    }
    if (entity.includes('allerg') || eventType.includes('allerg')) {
      topics.push('allergies.changed');
    }
    const out: SyncTopic[] = [];
    for (const topic of new Set(topics)) {
      if (
        topic === 'appointments.changed' ||
        topic === 'patients.changed' ||
        topic === 'allergies.changed'
      ) {
        out.push(topic);
      }
    }
    return out;
  }
}
