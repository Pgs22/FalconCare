import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, auditTime, catchError, concatMap, finalize, from, map, of, Subscription, switchMap, toArray } from 'rxjs';

import { belongsToPatientRelation } from '../../models/patient-relation.util';
import { documentDisplayNameFromRaw, documentTypeForUpload } from '../../models/document-api.util';
import type { Patient } from '../../models/patient.model';
import { DocumentService } from '../../services/document.service';
import { PatientRealtimeService, type PatientRealtimeEvent } from '../../services/patient-realtime.service';
import { PatientService } from '../../services/patient.service';

type DocumentTab = 'all' | 'pan' | 'pa';

type DocumentCard = {
  id: number;
  displayName: string;
  typeLabel: string;
  shortTag: string;
  captureDate: Date | null;
  captureDateLabel: string;
  description: string;
  iconKind: 'image' | 'pdf' | 'other';
};
type ViewerAssetKind = 'none' | 'image' | 'pdf' | 'text' | 'other';
type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

const PATIENT_LIST_HEIGHT_STORAGE_KEY = 'falconcare_documents_patient_list_height_px';
/** RAW / TAC / CBCT: el límite del servidor puede ser menor (413); aquí solo evitamos subidas absurdamente grandes en el cliente. */
const DOCUMENT_MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

@Component({
  standalone: true,
  selector: 'app-documents-page',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.css',
})
export class DocumentsPageComponent implements OnInit, OnDestroy {
  patients: Patient[] = [];
  selectedPatientId: number | null = null;

  loadingPatients = true;
  loadingDocuments = false;
  loadingViewerAsset = false;
  uploadingFiles = false;
  deletingDocument = false;

  documents: DocumentCard[] = [];
  activeDocumentId: number | null = null;
  activeTab: DocumentTab = 'all';

  loadError: string | null = null;
  /** Fallo al cargar binario / vista previa del documento activo (no bloquea listado ni badge de sync). */
  viewerError: string | null = null;
  /** URL `blob:` marcada como segura para `<embed>` / `<iframe>` (Angular RESOURCE_URL). */
  viewerTrustedResourceUrl: SafeResourceUrl | null = null;
  uploadFeedback: { kind: 'success' | 'error'; text: string } | null = null;
  noteDraft = '';
  noteSaving = false;
  noteFeedback: { kind: 'success' | 'error'; text: string } | null = null;
  patientListHeightPx = 180;
  lastRealtimeSyncAt: Date | null = null;
  madridNow = new Date();

  viewerImageUrl: string | null = null;
  viewerAssetKind: ViewerAssetKind = 'none';
  viewerDownloadName = '';
  private viewerObjectUrl: string | null = null;
  private viewerLoadSeq = 0;
  /** Descarga del visor: se cancela al cambiar de documento para evitar solapamientos y fugas. */
  private viewerDownloadSub: Subscription | null = null;

  private readonly subs = new Subscription();
  private madridClockTimer: ReturnType<typeof setInterval> | null = null;
  private resizingPatients = false;
  private resizeStartY = 0;
  private resizeStartHeight = 180;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly patientService: PatientService,
    private readonly documentService: DocumentService,
    private readonly patientRealtime: PatientRealtimeService,
    private readonly translate: TranslateService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.updateMadridClock();
    this.madridClockTimer = setInterval(() => this.updateMadridClock(), 1000);
    this.restorePatientListHeightPreference();
    this.subs.add(
      this.route.queryParamMap
        .pipe(
          map((params) => {
            const raw = params.get('patientId');
            const id = raw ? Number(raw) : NaN;
            return Number.isFinite(id) && id > 0 ? id : null;
          }),
          switchMap((requestedPatientId) => this.loadPatientsAndDocuments(requestedPatientId))
        )
        .subscribe()
    );
    this.subs.add(
      this.patientRealtime.changes$
        .pipe(
          auditTime(250),
          switchMap((event) => this.handleRealtimeEvent(event))
        )
        .subscribe()
    );
    this.subs.add(
      this.translate.onLangChange.subscribe(() => {
        this.refreshCaptureDateLabels();
      })
    );
  }

  ngOnDestroy(): void {
    this.viewerDownloadSub?.unsubscribe();
    this.viewerDownloadSub = null;
    this.subs.unsubscribe();
    if (this.madridClockTimer) {
      clearInterval(this.madridClockTimer);
      this.madridClockTimer = null;
    }
    this.revokeViewerObjectUrl();
  }

  get selectedPatient(): Patient | null {
    if (this.selectedPatientId == null) {
      return null;
    }
    return this.patients.find((p) => p.id === this.selectedPatientId) ?? null;
  }

  get selectedPatientName(): string {
    const p = this.selectedPatient;
    if (!p) {
      return this.t('documents.patient.defaultName');
    }
    const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    return full || this.t('documents.patient.fallbackWithId', { id: p.id });
  }

  /** Fecha de alta del paciente según `currentLang` (misma convención que las fechas de documentos). */
  get selectedPatientRegistrationDisplay(): string | null {
    const raw = this.selectedPatient?.registrationDate;
    if (raw == null || raw === '') {
      return null;
    }
    const d =
      typeof raw === 'string'
        ? this.parseDate(raw)
        : raw instanceof Date
          ? raw
          : null;
    if (!d || Number.isNaN(d.getTime())) {
      return null;
    }
    return new Intl.DateTimeFormat(this.dateLocaleTag(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }

  get visibleDocuments(): DocumentCard[] {
    if (this.activeTab === 'all') {
      return this.documents;
    }
    if (this.activeTab === 'pan') {
      return this.documents.filter((d) => d.shortTag === 'PAN');
    }
    return this.documents.filter((d) => d.shortTag === 'PA');
  }

  get activeDocument(): DocumentCard | null {
    if (this.activeDocumentId == null) {
      return null;
    }
    return this.documents.find((d) => d.id === this.activeDocumentId) ?? null;
  }

  /** Tipo mostrado en pie: vacío del API → clave i18n; sin documento activo → guion tipográfico. */
  get activeDocumentTypeDisplay(): string {
    const doc = this.activeDocument;
    if (!doc) {
      return this.t('documents.common.emDash');
    }
    const label = doc.typeLabel?.trim();
    return label ? label : this.t('documents.card.unknownType');
  }

  get footerDocumentIdText(): string {
    return this.activeDocument != null ? String(this.activeDocument.id) : this.t('documents.common.emDash');
  }

  get footerDocumentDateText(): string {
    return this.activeDocument != null ? this.activeDocument.captureDateLabel : this.t('documents.common.emDash');
  }

  get realtimeSyncLabel(): string {
    if (this.loadError) {
      return this.t('documents.sync.error');
    }
    if (this.loadingPatients || this.loadingDocuments) {
      return this.t('documents.sync.syncing');
    }
    if (this.selectedPatientId == null) {
      return this.t('documents.sync.waitingPatient');
    }
    if (!this.lastRealtimeSyncAt) {
      return this.t('documents.sync.pending');
    }
    return `${this.t('documents.sync.realtimePrefix')} · ${new Intl.DateTimeFormat(this.dateLocaleTag(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(this.lastRealtimeSyncAt)}`;
  }

  get notesSyncLabel(): string {
    if (this.noteFeedback?.kind === 'error') {
      return this.t('documents.notes.syncFailed');
    }
    if (!this.activeDocument) {
      return this.t('documents.notes.selectDocument');
    }
    return `${this.t('documents.notes.syncedPrefix')} · ${new Intl.DateTimeFormat(this.dateLocaleTag(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Madrid',
    }).format(this.madridNow)}`;
  }

  onSelectPatient(patientId: number): void {
    if (this.selectedPatientId === patientId) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { patientId },
      queryParamsHandling: 'merge',
    });
  }

  setActiveTab(tab: DocumentTab): void {
    this.activeTab = tab;
    this.ensureActiveDocumentVisibleInCurrentTab();
  }

  onSelectDocument(doc: DocumentCard): void {
    this.activeDocumentId = doc.id;
    this.noteDraft = '';
    this.noteFeedback = null;
    this.renderViewerAsset(doc);
  }

  openUploadPicker(input: HTMLInputElement): void {
    if (this.selectedPatientId == null || this.uploadingFiles) {
      return;
    }
    input.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (input) {
      input.value = '';
    }
    this.uploadDocuments(files);
  }

  startPatientListResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizingPatients = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.patientListHeightPx;
  }

  autoAdjustPatientListHeight(): void {
    const recommended = this.clampPatientListHeight(
      Math.max(180, this.patients.length * 42 + 24)
    );
    this.patientListHeightPx = recommended;
    this.persistPatientListHeightPreference();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (!this.resizingPatients) {
      return;
    }
    const delta = event.clientY - this.resizeStartY;
    const next = this.resizeStartHeight + delta;
    this.patientListHeightPx = this.clampPatientListHeight(next);
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.resizingPatients) {
      this.persistPatientListHeightPreference();
    }
    this.resizingPatients = false;
  }

  saveClinicalNote(): void {
    const patientId = this.selectedPatientId;
    const doc = this.activeDocument;
    const raw = this.noteDraft.trim();
    if (patientId == null || !doc || !raw || this.noteSaving) {
      return;
    }

    this.noteSaving = true;
    this.noteFeedback = null;
    const nowLabel = this.formatNowForNote();
    const nextEntry = this.t('documents.notes.historyLine', { time: nowLabel, text: raw });
    const nextDescription = doc.description.trim()
      ? `${doc.description.trim()}\n${nextEntry}`
      : nextEntry;

    this.subs.add(
      this.documentService
        .update(doc.id, patientId, { description: nextDescription })
        .pipe(
          switchMap(() => this.documentService.getById(doc.id, patientId)),
          map((freshRaw) => this.toDocumentCard(freshRaw as unknown)),
          finalize(() => {
            this.noteSaving = false;
          }),
          catchError((err: unknown) => {
            this.noteFeedback = { kind: 'error', text: this.mapDocumentHttpError(err, 'noteUpdate') };
            return of(null);
          })
        )
        .subscribe((freshCard) => {
          if (!freshCard) {
            return;
          }
          this.documents = this.documents.map((item) =>
            item.id === doc.id ? { ...item, ...freshCard } : item
          );
          this.noteDraft = '';
          this.lastRealtimeSyncAt = new Date();
          this.noteFeedback = {
            kind: 'success',
            text: this.t('documents.feedback.noteSaved'),
          };
        })
    );
  }

  removeActiveDocument(): void {
    const patientId = this.selectedPatientId;
    const active = this.activeDocument;
    if (patientId == null || !active || this.deletingDocument) {
      return;
    }
    if (!confirm(this.t('documents.actions.deleteConfirm', { name: active.displayName }))) {
      return;
    }
    this.deletingDocument = true;
    this.noteFeedback = null;
    this.uploadFeedback = null;
    this.subs.add(
      this.documentService
        .delete(patientId, active.id)
        .pipe(
          switchMap(() => this.loadDocumentsByPatient(patientId)),
          finalize(() => {
            this.deletingDocument = false;
          }),
          catchError((err: unknown) => {
            this.uploadFeedback = { kind: 'error', text: this.mapDocumentHttpError(err, 'delete') };
            return of(null);
          })
        )
        .subscribe((result) => {
          if (result === null && this.uploadFeedback?.kind === 'error') {
            return;
          }
          this.noteDraft = '';
          this.noteFeedback = null;
          this.uploadFeedback = { kind: 'success', text: this.t('documents.feedback.deleted') };
        })
    );
  }

  private loadPatientsAndDocuments(requestedPatientId: number | null) {
    this.loadingPatients = true;
    this.loadError = null;
    return this.patientService.list().pipe(
      map((patients) => patients.filter((p) => p.id != null && p.id > 0)),
      switchMap((patients) => {
        this.loadingPatients = false;
        this.patients = [...patients];
        if (patients.length === 0) {
          this.selectedPatientId = null;
          this.documents = [];
          this.activeDocumentId = null;
          this.revokeViewerObjectUrl();
          this.viewerImageUrl = null;
          this.lastRealtimeSyncAt = new Date();
          return of(null);
        }
        const selectedId =
          requestedPatientId != null && patients.some((p) => p.id === requestedPatientId)
            ? requestedPatientId
            : patients[0].id;
        this.selectedPatientId = selectedId;
        if (requestedPatientId !== selectedId) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { patientId: selectedId },
            queryParamsHandling: 'merge',
          });
        }
        return this.loadDocumentsByPatient(selectedId);
      }),
      catchError((err: unknown) => {
        this.loadingPatients = false;
        this.loadError = this.mapDocumentHttpError(err, 'list');
        this.patients = [];
        this.documents = [];
        this.selectedPatientId = null;
        this.activeDocumentId = null;
        this.revokeViewerObjectUrl();
        this.viewerImageUrl = null;
        this.viewerAssetKind = 'none';
        return of(null);
      })
    );
  }

  private loadDocumentsByPatient(patientId: number) {
    this.loadingDocuments = true;
    this.loadError = null;
    this.viewerError = null;
    return this.documentService.listByPatientId(patientId).pipe(
      map((rows) =>
        rows
          /* Las rutas de listado ya filtran por paciente; muchos backends no incluyen `patient` en cada ítem. */
          .filter((row) => belongsToPatientRelation(row, patientId))
          .map((row) => this.toDocumentCard(row))
          .filter((item): item is DocumentCard => item != null)
      ),
      map((cards) => this.uniqueDocumentsById(cards)),
      map((cards) => this.sortDocuments(cards)),
      map((cards) => {
        const prevActive = this.activeDocumentId;
        this.documents = cards;
        const visible = this.filterDocumentsForTab(cards, this.activeTab);
        const nextActive = visible.find((d) => d.id === this.activeDocumentId)?.id ?? visible[0]?.id ?? null;
        this.activeDocumentId = nextActive;
        this.loadingDocuments = false;
        if (nextActive == null) {
          this.viewerAssetKind = 'none';
          this.revokeViewerObjectUrl();
          this.viewerImageUrl = null;
          this.lastRealtimeSyncAt = new Date();
          return null;
        }
        const active = cards.find((d) => d.id === nextActive) ?? null;
        if (active && (nextActive !== prevActive || !this.viewerImageUrl)) {
          this.renderViewerAsset(active);
        }
        this.lastRealtimeSyncAt = new Date();
        return null;
      }),
      catchError((err: unknown) => {
        this.loadingDocuments = false;
        this.documents = [];
        this.activeDocumentId = null;
        this.viewerAssetKind = 'none';
        this.revokeViewerObjectUrl();
        this.viewerImageUrl = null;
        this.loadError = this.mapDocumentHttpError(err, 'list');
        return of(null);
      })
    );
  }

  private handleRealtimeEvent(event: PatientRealtimeEvent) {
    const selectedPatientId = this.selectedPatientId;
    if (event.kind === 'patient-mutated') {
      return this.loadPatientsAndDocuments(selectedPatientId);
    }
    if (event.kind === 'document-mutated') {
      return this.handleDocumentMutatedEvent(event);
    }
    if (selectedPatientId == null) {
      return of(null);
    }
    return this.loadDocumentsByPatient(selectedPatientId);
  }

  private handleDocumentMutatedEvent(event: Extract<PatientRealtimeEvent, { kind: 'document-mutated' }>) {
    const selectedPatientId = this.selectedPatientId;
    if (selectedPatientId == null) {
      return of(null);
    }
    if (event.patientId != null && event.patientId !== selectedPatientId) {
      return of(null);
    }
    if (event.action === 'created' || event.action === 'deleted') {
      return this.loadDocumentsByPatient(selectedPatientId);
    }
    const targetId = event.documentId ?? this.activeDocumentId;
    if (targetId == null) {
      return this.loadDocumentsByPatient(selectedPatientId);
    }
    return this.refreshDocumentCard(targetId, selectedPatientId).pipe(
      catchError(() => this.loadDocumentsByPatient(selectedPatientId))
    );
  }

  private refreshDocumentCard(documentId: number, patientId: number) {
    return this.documentService.getById(documentId, patientId).pipe(
      map((freshRaw) => this.toDocumentCard(freshRaw as unknown)),
      map((freshCard) => {
        if (!freshCard) {
          return null;
        }
        let found = false;
        this.documents = this.documents.map((item) => {
          if (item.id !== documentId) {
            return item;
          }
          found = true;
          return { ...item, ...freshCard };
        });
        if (!found) {
          this.documents = this.sortDocuments([...this.documents, freshCard]);
        }
        this.lastRealtimeSyncAt = new Date();
        return null;
      })
    );
  }

  private uniqueDocumentsById(cards: DocumentCard[]): DocumentCard[] {
    const mapById = new Map<number, DocumentCard>();
    for (const card of cards) {
      mapById.set(card.id, card);
    }
    return Array.from(mapById.values());
  }

  private toDocumentCard(raw: unknown): DocumentCard | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const row = raw as Record<string, unknown>;
    const id = Number(row['id']);
    if (!Number.isFinite(id) || id < 1) {
      return null;
    }
    const type = this.pickString(row, ['type', 'mimeType', 'mime_type', 'contentType', 'content_type']) || '';
    const capture = this.pickString(row, ['captureDate', 'capture_date', 'createdAt', 'created_at']);
    const captureDate = this.parseDate(capture);
    const description = this.pickString(row, ['description', 'notes', 'clinicalNotes', 'clinical_notes']);
    const displayName = documentDisplayNameFromRaw(row);
    const iconKind = this.resolveIconKind(type, displayName);
    return {
      id,
      displayName,
      typeLabel: type,
      shortTag: this.resolveShortTag(type, displayName),
      captureDate,
      captureDateLabel: this.formatCaptureDateLabel(captureDate),
      description,
      iconKind,
    };
  }

  private sortDocuments(cards: DocumentCard[]): DocumentCard[] {
    return [...cards].sort((a, b) => {
      const tA = a.captureDate?.getTime() ?? 0;
      const tB = b.captureDate?.getTime() ?? 0;
      if (tA !== tB) {
        return tB - tA;
      }
      return b.id - a.id;
    });
  }

  private filterDocumentsForTab(cards: DocumentCard[], tab: DocumentTab): DocumentCard[] {
    if (tab === 'all') {
      return cards;
    }
    if (tab === 'pan') {
      return cards.filter((d) => d.shortTag === 'PAN');
    }
    return cards.filter((d) => d.shortTag === 'PA');
  }

  private ensureActiveDocumentVisibleInCurrentTab(): void {
    const visible = this.filterDocumentsForTab(this.documents, this.activeTab);
    const nextActive = visible.find((d) => d.id === this.activeDocumentId) ?? visible[0] ?? null;
    const previousId = this.activeDocumentId;
    this.activeDocumentId = nextActive?.id ?? null;
    if (!nextActive) {
      this.revokeViewerObjectUrl();
      this.viewerImageUrl = null;
      this.viewerAssetKind = 'none';
      return;
    }
    if (nextActive.id === previousId) {
      return;
    }
    this.onSelectDocument(nextActive);
  }

  private renderViewerAsset(doc: DocumentCard): void {
    if (this.selectedPatientId == null) {
      return;
    }
    const seq = ++this.viewerLoadSeq;
    this.viewerError = null;
    this.viewerTrustedResourceUrl = null;
    this.revokeViewerObjectUrl();
    this.viewerImageUrl = null;
    this.viewerAssetKind = 'none';
    this.viewerDownloadName = doc.displayName || this.t('documents.downloads.fallbackFilename', { id: doc.id });
    this.viewerDownloadSub?.unsubscribe();
    this.viewerDownloadSub = null;
    this.loadingViewerAsset = true;
    this.viewerDownloadSub = this.documentService
        .download(doc.id, this.selectedPatientId)
        .pipe(
          finalize(() => {
            if (seq === this.viewerLoadSeq) {
              this.loadingViewerAsset = false;
            }
          }),
          catchError((err: unknown) => {
            if (seq !== this.viewerLoadSeq) {
              return of(null);
            }
            this.viewerImageUrl = null;
            this.viewerAssetKind = 'none';
            this.viewerTrustedResourceUrl = null;
            this.viewerError = this.mapDocumentHttpError(err, 'download');
            return of(null);
          }),
          switchMap((blob: Blob | null) => {
            if (!blob || seq !== this.viewerLoadSeq) {
              return of<{ blob: Blob; kind: PreviewKind } | null>(null);
            }
            return this.sniffPreviewKind(blob, doc).pipe(map((kind) => ({ blob, kind })));
          })
        )
        .subscribe((pack) => {
          if (!pack || seq !== this.viewerLoadSeq) {
            return;
          }
          const { blob, kind } = pack;
          const objectUrl = URL.createObjectURL(blob);
          if (seq !== this.viewerLoadSeq) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          this.viewerObjectUrl = objectUrl;
          this.viewerImageUrl = objectUrl;
          this.viewerTrustedResourceUrl = null;
          if (kind === 'image') {
            this.viewerAssetKind = 'image';
            return;
          }
          if (kind === 'pdf') {
            this.viewerAssetKind = 'pdf';
            this.viewerTrustedResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
            return;
          }
          if (kind === 'text') {
            this.viewerAssetKind = 'text';
            this.viewerTrustedResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
            return;
          }
          this.viewerAssetKind = 'other';
        });
  }

  /** Clasifica el binario descargado: firma mágica, MIME y nombre (p. ej. PDF con `application/octet-stream`). */
  private sniffPreviewKind(blob: Blob, doc: DocumentCard): Observable<PreviewKind> {
    const size = blob.size ?? 0;
    const take = Math.min(256, Math.max(0, size));
    if (take === 0) {
      return of(this.classifyPreviewMimeOnly(blob, doc));
    }
    return from(blob.slice(0, take).arrayBuffer()).pipe(
      map((buf) => this.classifyPreviewFromBuffer(buf, blob, doc)),
      catchError(() => of(this.classifyPreviewMimeOnly(blob, doc)))
    );
  }

  private classifyPreviewFromBuffer(buf: ArrayBuffer, blob: Blob, doc: DocumentCard): PreviewKind {
    const u = new Uint8Array(buf);
    if (u.length >= 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) {
      return 'pdf';
    }
    if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) {
      return 'image';
    }
    if (u.length >= 4 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) {
      return 'image';
    }
    if (u.length >= 6 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) {
      return 'image';
    }
    if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) {
      const tag = String.fromCharCode(u[8] ?? 0, u[9] ?? 0, u[10] ?? 0, u[11] ?? 0);
      if (tag === 'WEBP') {
        return 'image';
      }
    }
    if (u.length >= 2 && u[0] === 0x42 && u[1] === 0x4d) {
      return 'image';
    }
    if (u.length >= 4) {
      const le = u[0] === 0x49 && u[1] === 0x49 && u[2] === 0x2a && u[3] === 0x00;
      const be = u[0] === 0x4d && u[1] === 0x4d && u[2] === 0x00 && u[3] === 0x2a;
      if (le || be) {
        return 'image';
      }
    }
    const head = new TextDecoder('utf-8', { fatal: false }).decode(u.slice(0, Math.min(u.length, 512))).trimStart();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
      return 'image';
    }
    if (head.startsWith('<!DOCTYPE') || head.startsWith('<html')) {
      return 'text';
    }
    return this.classifyPreviewMimeOnly(blob, doc);
  }

  private classifyPreviewMimeOnly(blob: Blob, doc: DocumentCard): PreviewKind {
    const mime = (blob.type || '').toLowerCase();
    const name = (doc.displayName || '').toLowerCase();
    const treatAsPdf =
      doc.iconKind === 'pdf' || mime.includes('pdf') || /\.pdf(\?|$)/i.test(doc.displayName || '');
    if (treatAsPdf) {
      return 'pdf';
    }
    if (doc.iconKind === 'image' || mime.startsWith('image/')) {
      return 'image';
    }
    if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
      return 'text';
    }
    if (
      name.endsWith('.svg') ||
      name.endsWith('.json') ||
      name.endsWith('.xml') ||
      name.endsWith('.txt') ||
      name.endsWith('.csv') ||
      name.endsWith('.html') ||
      name.endsWith('.htm') ||
      name.endsWith('.md')
    ) {
      return 'text';
    }
    return 'other';
  }

  private uploadDocuments(files: File[]): void {
    if (this.selectedPatientId == null || files.length === 0 || this.uploadingFiles) {
      return;
    }
    const validFiles = this.validateFilesForUpload(files);
    if (!validFiles) {
      return;
    }
    this.uploadFeedback = null;
    this.uploadingFiles = true;
    const patientId = this.selectedPatientId;
    this.subs.add(
      from(validFiles)
        .pipe(
          concatMap((file) =>
            this.documentService.create({
              file,
              patientId,
              type: documentTypeForUpload(file),
              description: file.name,
            })
          ),
          toArray(),
          switchMap(() => this.loadDocumentsByPatient(patientId)),
          catchError((err: unknown) => {
            this.uploadFeedback = {
              kind: 'error',
              text: this.mapDocumentHttpError(err, 'upload'),
            };
            return of(null);
          }),
          finalize(() => {
            this.uploadingFiles = false;
          })
        )
        .subscribe((result) => {
          if (result === null && this.uploadFeedback?.kind === 'error') {
            return;
          }
          this.uploadFeedback = {
            kind: 'success',
            text:
              validFiles.length === 1
                ? this.t('documents.feedback.uploadOne')
                : this.t('documents.feedback.uploadMany', { count: validFiles.length }),
          };
        })
    );
  }

  private validateFilesForUpload(files: File[]): File[] | null {
    const nonEmpty = files.filter((file) => file.size > 0);
    if (nonEmpty.length === 0) {
      this.uploadFeedback = {
        kind: 'error',
        text:
          files.length > 0
            ? this.t('documents.feedback.filesEmpty')
            : this.t('documents.feedback.selectAtLeastOne'),
      };
      return null;
    }
    const oversized = nonEmpty.find((file) => file.size > DOCUMENT_MAX_UPLOAD_BYTES);
    if (oversized) {
      this.uploadFeedback = {
        kind: 'error',
        text: this.t('documents.feedback.fileTooLarge', {
          name: oversized.name,
          maxMb: Math.round(DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024)),
        }),
      };
      return null;
    }
    return nonEmpty;
  }

  private revokeViewerObjectUrl(): void {
    this.viewerTrustedResourceUrl = null;
    if (this.viewerObjectUrl) {
      URL.revokeObjectURL(this.viewerObjectUrl);
      this.viewerObjectUrl = null;
    }
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private parseDate(raw: string): Date | null {
    if (!raw) {
      return null;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private resolveShortTag(type: string, displayName: string): string {
    const lower = `${type} ${displayName}`.toLowerCase();
    if (lower.includes('pan')) {
      return 'PAN';
    }
    if (lower.includes('peri')) {
      return 'PA';
    }
    if (lower.includes('bite') || lower.includes('bw')) {
      return 'BW';
    }
    if (lower.includes('pdf')) {
      return 'PDF';
    }
    return 'DOC';
  }

  private resolveIconKind(type: string, displayName: string): 'image' | 'pdf' | 'other' {
    const lower = `${type} ${displayName}`.toLowerCase();
    if (
      lower.includes('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff|heic|heif|cr2|nef|arw|dng|orf|raf|rw2|pef|srw|raw|3fr|sr2|x3f)$/i.test(
        displayName
      )
    ) {
      return 'image';
    }
    if (lower.includes('pdf') || displayName.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    return 'other';
  }

  private clampPatientListHeight(value: number): number {
    const min = 96;
    const max = 420;
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private persistPatientListHeightPreference(): void {
    try {
      localStorage.setItem(
        PATIENT_LIST_HEIGHT_STORAGE_KEY,
        String(this.patientListHeightPx)
      );
    } catch {
      // Storage may be blocked; keep runtime behavior.
    }
  }

  private restorePatientListHeightPreference(): void {
    try {
      const raw = localStorage.getItem(PATIENT_LIST_HEIGHT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return;
      }
      this.patientListHeightPx = this.clampPatientListHeight(parsed);
    } catch {
      // Storage may be blocked; fallback to default height.
    }
  }

  private formatNowForNote(): string {
    return new Intl.DateTimeFormat(this.dateLocaleTag(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  }

  /** Locale BCP 47 alineado con el idioma activo de ngx-translate (fechas en listado y pies). */
  private dateLocaleTag(): string {
    const raw = (this.translate.currentLang || this.translate.defaultLang || 'es').toLowerCase();
    const base = raw.split('-')[0] ?? 'es';
    const map: Record<string, string> = {
      es: 'es-ES',
      en: 'en-GB',
      ca: 'ca-ES',
      fr: 'fr-FR',
    };
    return map[base] ?? 'es-ES';
  }

  private formatCaptureDateLabel(captureDate: Date | null): string {
    if (!captureDate) {
      return this.t('documents.card.noDate');
    }
    return new Intl.DateTimeFormat(this.dateLocaleTag(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(captureDate);
  }

  private refreshCaptureDateLabels(): void {
    if (this.documents.length === 0) {
      return;
    }
    this.documents = this.documents.map((d) => ({
      ...d,
      captureDateLabel: this.formatCaptureDateLabel(d.captureDate),
    }));
  }

  private updateMadridClock(): void {
    this.madridNow = new Date();
  }

  /** `maxUploadBytes` en raíz o en `details` (Symfony 413). */
  private pickMaxUploadBytesFromError(http: HttpErrorResponse): number | null {
    const e = http.error;
    if (!e || typeof e !== 'object') {
      return null;
    }
    const o = e as Record<string, unknown>;
    const root = o['maxUploadBytes'];
    if (typeof root === 'number' && Number.isFinite(root) && root > 0) {
      return root;
    }
    const details = o['details'];
    if (details && typeof details === 'object') {
      const d = (details as Record<string, unknown>)['maxUploadBytes'];
      if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    return null;
  }

  /** Mensaje legible del JSON de error del API (`message`). */
  private pickBackendErrorMessage(http: HttpErrorResponse): string | null {
    const e = http.error;
    if (!e || typeof e !== 'object') {
      return null;
    }
    const m = (e as Record<string, unknown>)['message'];
    return typeof m === 'string' && m.trim().length > 0 ? m.trim() : null;
  }

  private mapDocumentHttpError(
    err: unknown,
    context: 'list' | 'upload' | 'noteUpdate' | 'delete' | 'download'
  ): string {
    const http = err as HttpErrorResponse;
    if (http?.status === 401) {
      return this.t('documents.errors.sessionExpired');
    }
    if (http?.status === 403) {
      return this.pickBackendErrorMessage(http) ?? this.t('documents.errors.forbidden');
    }
    if (http?.status === 404) {
      return this.t('documents.errors.notFound');
    }
    if (http?.status === 409) {
      const msg409 = this.pickBackendErrorMessage(http);
      if (msg409) {
        return msg409;
      }
      return context === 'delete'
        ? this.t('documents.errors.deleteConflict')
        : this.t('documents.errors.conflict');
    }
    if (http?.status === 413) {
      const max = this.pickMaxUploadBytesFromError(http);
      if (max != null && max > 0) {
        return this.t('documents.errors.serverMaxFile', { maxMb: Math.round(max / (1024 * 1024)) });
      }
      const msg413 = this.pickBackendErrorMessage(http);
      if (msg413) {
        return msg413;
      }
      return this.t('documents.errors.serverFileTooLarge');
    }
    if (http?.status === 400) {
      const msg400 = this.pickBackendErrorMessage(http);
      if (context === 'upload') {
        return msg400 ?? this.t('documents.errors.uploadBadRequest');
      }
      if (context === 'list') {
        return msg400 ?? this.t('documents.errors.listBadRequest');
      }
      return msg400 ?? this.t('documents.errors.badRequest');
    }
    if (http?.status === 0) {
      return this.t('documents.errors.offline');
    }
    if (context === 'noteUpdate') {
      return this.t('documents.errors.noteUpdate');
    }
    if (context === 'upload') {
      return this.t('documents.errors.uploadGeneric');
    }
    if (context === 'download') {
      return this.t('documents.errors.download');
    }
    return this.t('documents.errors.list');
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}

