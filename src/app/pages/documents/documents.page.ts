import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { auditTime, catchError, concatMap, finalize, from, map, of, Subscription, switchMap, toArray } from 'rxjs';

import { belongsToPatientRelationStrict } from '../../models/patient-relation.util';
import { documentDisplayNameFromRaw, documentTypeForUpload } from '../../models/document-api.util';
import type { Patient } from '../../models/patient.model';
import { AppointmentService } from '../../services/appointment.service';
import { DocumentService } from '../../services/document.service';
import { PatientRealtimeService, type PatientRealtimeEvent } from '../../services/patient-realtime.service';
import { PatientService } from '../../services/patient.service';
import {
  RadiographAnnotationService,
  type RadiographAnnotationView,
} from '../../services/radiograph-annotation.service';

type DocumentTab = 'all' | 'pan' | 'pa';
type SnapSensitivity = 'low' | 'medium' | 'high';
type SnapSensitivityMode = 'auto' | 'manual';

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
type ViewerAssetKind = 'none' | 'image' | 'pdf' | 'other';
type MeasurePoint = { xPct: number; yPct: number };
type StageSize = { width: number; height: number };
type PatientAppointmentOption = { id: number; label: string };

const PATIENT_LIST_HEIGHT_STORAGE_KEY = 'falconcare_documents_patient_list_height_px';
const CALIBRATION_LOCK_STORAGE_PREFIX = 'falconcare_documents_calibration_lock';
const SNAP_SENSITIVITY_STORAGE_PREFIX = 'falconcare_documents_snap_sensitivity';
const DOCUMENT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

@Component({
  standalone: true,
  selector: 'app-documents-page',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.css',
})
export class DocumentsPageComponent implements OnInit, OnDestroy {
  patients: Patient[] = [];
  filteredPatients: Patient[] = [];
  patientSearch = '';
  selectedPatientId: number | null = null;

  loadingPatients = true;
  loadingDocuments = false;
  loadingViewerAsset = false;
  uploadingFiles = false;

  documents: DocumentCard[] = [];
  activeDocumentId: number | null = null;
  activeTab: DocumentTab = 'all';

  loadError: string | null = null;
  uploadFeedback: { kind: 'success' | 'error'; text: string } | null = null;
  noteDraft = '';
  noteSaving = false;
  noteFeedback: { kind: 'success' | 'error'; text: string } | null = null;
  appointmentsByPatient: PatientAppointmentOption[] = [];
  selectedAppointmentId: number | null = null;
  loadingAnnotations = false;
  annotationSaving = false;
  annotationFeedback: { kind: 'success' | 'error'; text: string } | null = null;
  annotations: RadiographAnnotationView[] = [];
  annotationDraftLabel = '';
  annotationDraftColor = '#00d4db';
  patientListHeightPx = 180;
  lastRealtimeSyncAt: Date | null = null;

  viewerImageUrl: string | null = null;
  viewerAssetKind: ViewerAssetKind = 'none';
  viewerDownloadName = '';
  zoomLevel = 1;
  measureMode = false;
  calibrationMode = false;
  calibrationLocked = true;
  snapEnabled = true;
  snapSensitivityMode: SnapSensitivityMode = 'auto';
  snapSensitivity: SnapSensitivity = 'medium';
  pxPerCm = 37.8;
  measurePointA: MeasurePoint | null = null;
  measurePointB: MeasurePoint | null = null;
  measureHoverPoint: MeasurePoint | null = null;
  calibrationPointA: MeasurePoint | null = null;
  calibrationPointB: MeasurePoint | null = null;
  calibrationHoverPoint: MeasurePoint | null = null;
  calibrationReferenceCm = 1;
  lastMeasuredCm: number | null = null;
  liveMeasuredCm: number | null = null;
  private viewerObjectUrl: string | null = null;
  private lastStageSize: StageSize | null = null;
  private snapGrayMap: Uint8ClampedArray | null = null;
  private snapMapWidth = 0;
  private snapMapHeight = 0;
  private snapLoadSeq = 0;
  private lastLoadedAnnotationKey: string | null = null;

  private readonly subs = new Subscription();
  private resizingPatients = false;
  private resizeStartY = 0;
  private resizeStartHeight = 180;
  private viewerInteractionActive = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly patientService: PatientService,
    private readonly appointmentService: AppointmentService,
    private readonly documentService: DocumentService,
    private readonly patientRealtime: PatientRealtimeService,
    private readonly annotationService: RadiographAnnotationService
  ) {}

  ngOnInit(): void {
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
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
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
      return 'Paciente';
    }
    const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    return full || `Paciente #${p.id}`;
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

  get zoomPercent(): number {
    return Math.round(this.zoomLevel * 100);
  }

  get zoomFillPercent(): number {
    const min = 0.5;
    const max = 3;
    const normalized = ((this.zoomLevel - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  get measurementLineStyle(): Record<string, string> | null {
    const endPoint = this.getActiveMeasureEndPoint();
    if (!this.measurePointA || !endPoint) {
      return null;
    }
    const x1 = this.measurePointA.xPct;
    const y1 = this.measurePointA.yPct;
    const x2 = endPoint.xPct;
    const y2 = endPoint.yPct;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      left: `${x1 * 100}%`,
      top: `${y1 * 100}%`,
      width: `${length * 100}%`,
      transform: `translateY(-50%) rotate(${angle}deg)`,
    };
  }

  get measurementBadgeStyle(): Record<string, string> | null {
    const endPoint = this.getActiveMeasureEndPoint();
    if (!this.measurePointA || !endPoint) {
      return null;
    }
    const midX = ((this.measurePointA.xPct + endPoint.xPct) / 2) * 100;
    const midY = ((this.measurePointA.yPct + endPoint.yPct) / 2) * 100;
    return {
      left: `${midX}%`,
      top: `${midY}%`,
      transform: 'translate(-50%, -120%)',
    };
  }

  get calibrationLineStyle(): Record<string, string> | null {
    const endPoint = this.getActiveCalibrationEndPoint();
    if (!this.calibrationPointA || !endPoint) {
      return null;
    }
    const x1 = this.calibrationPointA.xPct;
    const y1 = this.calibrationPointA.yPct;
    const x2 = endPoint.xPct;
    const y2 = endPoint.yPct;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      left: `${x1 * 100}%`,
      top: `${y1 * 100}%`,
      width: `${length * 100}%`,
      transform: `translateY(-50%) rotate(${angle}deg)`,
    };
  }

  get calibrationBadgeStyle(): Record<string, string> | null {
    const endPoint = this.getActiveCalibrationEndPoint();
    if (!this.calibrationPointA || !endPoint) {
      return null;
    }
    const midX = ((this.calibrationPointA.xPct + endPoint.xPct) / 2) * 100;
    const midY = ((this.calibrationPointA.yPct + endPoint.yPct) / 2) * 100;
    return {
      left: `${midX}%`,
      top: `${midY}%`,
      transform: 'translate(-50%, 14px)',
    };
  }

  get calibrationLabel(): string {
    if (!this.calibrationMode) {
      return '';
    }
    if (!this.calibrationPointA) {
      return 'Calibración: clic en punto inicial';
    }
    if (!this.calibrationPointB) {
      return 'Calibración: clic en punto final';
    }
    return `Referencia: ${this.calibrationReferenceCm.toFixed(2)} cm`;
  }

  get measureLabel(): string {
    if (this.liveMeasuredCm != null) {
      return `${this.liveMeasuredCm.toFixed(2)} cm`;
    }
    if (this.lastMeasuredCm == null) {
      return 'Medición pendiente';
    }
    return `${this.lastMeasuredCm.toFixed(2)} cm`;
  }

  get canMeasureOnCurrentDocument(): boolean {
    const doc = this.activeDocument;
    if (!doc || this.viewerAssetKind !== 'image') {
      return false;
    }
    return ['PAN', 'PA', 'BW'].includes(doc.shortTag);
  }

  get snapStatusLabel(): string {
    if (!this.canMeasureOnCurrentDocument) {
      return 'Snap no disponible';
    }
    const sensitivity = this.snapSensitivityLabel;
    const mode = this.snapSensitivityMode === 'auto' ? 'auto' : 'manual';
    return this.snapEnabled ? `Snap ON (${sensitivity}, ${mode})` : `Snap OFF (${sensitivity}, ${mode})`;
  }

  get snapSensitivityLabel(): string {
    switch (this.effectiveSnapSensitivity) {
      case 'low':
        return 'Bajo';
      case 'high':
        return 'Alto';
      default:
        return 'Medio';
    }
  }

  get snapSensitivitySelectValue(): string {
    return this.snapSensitivityMode === 'auto' ? 'auto' : this.snapSensitivity;
  }

  get activeNotes(): Array<{ badge: string; title: string; body: string; ageLabel: string; author: string }> {
    const doc = this.activeDocument;
    if (!doc) {
      return [];
    }
    const parsed = this.parseNotesFromDescription(doc.description);
    if (parsed.length === 0) {
      return [
        {
          badge: doc.shortTag,
          title: 'Sin notas registradas',
          body: `Tipo: ${doc.typeLabel}. Captura: ${doc.captureDateLabel}.`,
          ageLabel: '—',
          author: 'Sistema',
        },
      ];
    }
    return parsed.map((body, idx) => ({
      badge: idx === 0 ? String(doc.id) : doc.shortTag,
      title: idx === 0 ? 'Nota clínica principal' : `Nota clínica #${idx + 1}`,
      body,
      ageLabel: idx === 0 ? 'Reciente' : 'Histórico',
      author: 'Equipo clínico',
    }));
  }

  get realtimeSyncLabel(): string {
    if (!this.lastRealtimeSyncAt) {
      return 'Sincronizando...';
    }
    return `Sincronizado en tiempo real · ${new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(this.lastRealtimeSyncAt)}`;
  }

  get notesSyncLabel(): string {
    if (!this.activeDocument) {
      return 'Selecciona un documento para sincronizar notas.';
    }
    if (!this.lastRealtimeSyncAt) {
      return 'Sincronizando notas...';
    }
    return `Notas sincronizadas · ${new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(this.lastRealtimeSyncAt)}`;
  }

  get canPersistAnnotation(): boolean {
    return this.selectedPatientId != null && this.activeDocument != null && this.selectedAppointmentId != null;
  }

  onPatientSearchChange(value: string): void {
    this.patientSearch = value;
    const term = value.trim().toLowerCase();
    if (!term) {
      this.filteredPatients = [...this.patients];
      return;
    }
    this.filteredPatients = this.patients.filter((p) => {
      const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase();
      return fullName.includes(term) || String(p.id).includes(term);
    });
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
  }

  onSelectDocument(doc: DocumentCard): void {
    this.activeDocumentId = doc.id;
    this.noteDraft = '';
    this.noteFeedback = null;
    this.resetViewerAdjustments();
    this.clearMeasurement();
    this.applyStoredCalibrationForDocument(doc);
    this.applyStoredSnapSensitivityForDocument(doc);
    this.renderViewerAsset(doc);
    this.loadAnnotationsForSelection();
  }

  onAppointmentFilterChange(rawValue: string): void {
    const parsed = Number(rawValue);
    this.selectedAppointmentId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.loadAnnotationsForSelection();
  }

  zoomOut(): void {
    this.zoomLevel = this.clampZoom(this.zoomLevel - 0.1);
  }

  zoomIn(): void {
    this.zoomLevel = this.clampZoom(this.zoomLevel + 0.1);
  }

  onViewerWheel(event: WheelEvent): void {
    this.applyTrackpadZoom(event);
  }

  onViewerPointerEnter(): void {
    this.viewerInteractionActive = true;
  }

  onViewerPointerLeave(): void {
    this.viewerInteractionActive = false;
  }

  toggleMeasureMode(): void {
    if (!this.canMeasureOnCurrentDocument) {
      return;
    }
    this.measureMode = !this.measureMode;
    if (this.measureMode) {
      this.calibrationMode = false;
    }
    this.clearMeasurement();
  }

  toggleCalibrationMode(): void {
    if (!this.canMeasureOnCurrentDocument) {
      return;
    }
    this.calibrationMode = !this.calibrationMode;
    if (this.calibrationMode) {
      this.measureMode = false;
    }
    this.clearCalibrationSelection();
  }

  toggleCalibrationLock(): void {
    this.calibrationLocked = !this.calibrationLocked;
    const active = this.activeDocument;
    const patientId = this.selectedPatientId;
    if (!active || patientId == null) {
      return;
    }
    if (this.calibrationLocked) {
      this.persistCalibration(patientId, active);
      return;
    }
    this.clearStoredCalibrationLock(patientId, active);
  }

  toggleSnap(): void {
    if (!this.canMeasureOnCurrentDocument) {
      return;
    }
    this.snapEnabled = !this.snapEnabled;
  }

  onSnapSensitivityChange(rawValue: string): void {
    if (rawValue === 'auto') {
      this.snapSensitivityMode = 'auto';
      this.persistSnapSensitivityForCurrentDocument();
      return;
    }
    if (rawValue === 'low' || rawValue === 'medium' || rawValue === 'high') {
      this.snapSensitivityMode = 'manual';
      this.snapSensitivity = rawValue;
      this.persistSnapSensitivityForCurrentDocument();
    }
  }

  onViewerCanvasClick(event: MouseEvent): void {
    if (!this.canMeasureOnCurrentDocument) {
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    this.lastStageSize = { width: rect.width, height: rect.height };
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const rawPoint = this.toStagePoint(event, rect);
    if (!rawPoint) {
      return;
    }
    const point: MeasurePoint = this.applySnapToPoint(rawPoint, rect.width, rect.height);

    if (this.calibrationMode) {
      this.registerCalibrationPoint(point, rect.width, rect.height);
      return;
    }
    if (!this.measureMode) {
      return;
    }

    if (!this.measurePointA || this.measurePointB) {
      this.measurePointA = point;
      this.measurePointB = null;
      this.lastMeasuredCm = null;
      return;
    }

    this.measurePointB = point;
    this.lastMeasuredCm = this.calculateMeasurementCm(rect.width, rect.height);
  }

  onPxPerCmChange(rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    this.pxPerCm = Math.max(1, Math.min(500, parsed));
    this.persistCalibrationForCurrentSelection();
    if (this.measurePointA && this.measurePointB) {
      const stage = document.querySelector('.documents-render-stage') as HTMLElement | null;
      if (!stage) {
        return;
      }
      const rect = stage.getBoundingClientRect();
      this.lastMeasuredCm = this.calculateMeasurementCm(rect.width, rect.height);
    }
  }

  onViewerCanvasMouseMove(event: MouseEvent): void {
    if (!this.canMeasureOnCurrentDocument) {
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    this.lastStageSize = { width: rect.width, height: rect.height };
    const rawPoint = this.toStagePoint(event, rect);
    if (!rawPoint) {
      return;
    }
    const point = this.applySnapToPoint(rawPoint, rect.width, rect.height);

    if (this.measureMode && this.measurePointA && !this.measurePointB) {
      this.measureHoverPoint = point;
      this.liveMeasuredCm = this.calculateMeasurementCmFromPoints(
        this.measurePointA,
        point,
        rect.width,
        rect.height
      );
    }

    if (this.calibrationMode && this.calibrationPointA && !this.calibrationPointB) {
      this.calibrationHoverPoint = point;
    }
  }

  onViewerCanvasMouseLeave(): void {
    this.measureHoverPoint = null;
    this.calibrationHoverPoint = null;
    if (this.measurePointB == null) {
      this.liveMeasuredCm = null;
    }
  }

  onCalibrationReferenceCmChange(rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    this.calibrationReferenceCm = Math.max(0.1, Math.min(100, parsed));
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
      Math.max(180, this.filteredPatients.length * 42 + 24)
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

  @HostListener('window:wheel', ['$event'])
  onWindowWheel(event: WheelEvent): void {
    if (!this.viewerInteractionActive) {
      return;
    }
    this.applyTrackpadZoom(event);
  }

  applyQuickTag(tag: 'Caries' | 'Perio' | 'Raíz'): void {
    if (!this.activeDocument || this.noteSaving) {
      return;
    }
    const prefix = `${tag}: `;
    if (this.noteDraft.trim().length === 0) {
      this.noteDraft = prefix;
      return;
    }
    if (!this.noteDraft.endsWith(' ')) {
      this.noteDraft += ' ';
    }
    this.noteDraft += prefix;
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
    const nextEntry = `${nowLabel} — ${raw}`;
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
          this.noteFeedback = {
            kind: 'success',
            text: 'Nota clínica guardada y verificada correctamente en base de datos.',
          };
        })
    );
  }

  createMeasurementAnnotation(): void {
    const patientId = this.selectedPatientId;
    const document = this.activeDocument;
    const appointmentId = this.selectedAppointmentId;
    if (patientId == null || !document || appointmentId == null || this.annotationSaving) {
      return;
    }
    const payload = this.buildMeasurementPayload();
    if (!payload) {
      this.annotationFeedback = {
        kind: 'error',
        text: 'Primero completa una medición para guardar la anotación.',
      };
      return;
    }
    this.annotationSaving = true;
    this.annotationFeedback = null;
    this.subs.add(
      this.annotationService
        .create(document.id, patientId, {
          appointmentId,
          tool: 'measure',
          label: this.annotationDraftLabel.trim() || 'Medición',
          color: this.annotationDraftColor,
          payload,
        })
        .pipe(
          finalize(() => {
            this.annotationSaving = false;
          }),
          catchError((err: unknown) => {
            this.annotationFeedback = { kind: 'error', text: this.mapAnnotationHttpError(err) };
            return of(null);
          })
        )
        .subscribe((created) => {
          if (!created) {
            return;
          }
          this.annotations = this.sortAnnotations([...this.annotations, created]);
          this.annotationDraftLabel = '';
          this.annotationFeedback = { kind: 'success', text: 'Anotación guardada correctamente.' };
          this.patientRealtime.publishDocumentMutation('updated', patientId, document.id);
          this.lastRealtimeSyncAt = new Date();
        })
    );
  }

  renameAnnotation(annotation: RadiographAnnotationView): void {
    const patientId = this.selectedPatientId;
    const document = this.activeDocument;
    if (patientId == null || !document || this.annotationSaving) {
      return;
    }
    const nextLabel = window.prompt('Nueva etiqueta de anotación', annotation.label || 'Anotación');
    if (nextLabel == null) {
      return;
    }
    this.annotationSaving = true;
    this.annotationFeedback = null;
    this.subs.add(
      this.annotationService
        .update(document.id, annotation.id, patientId, {
          label: nextLabel.trim(),
          color: annotation.color,
          payload: annotation.payload,
        })
        .pipe(
          finalize(() => {
            this.annotationSaving = false;
          }),
          catchError((err: unknown) => {
            this.annotationFeedback = { kind: 'error', text: this.mapAnnotationHttpError(err) };
            return of(null);
          })
        )
        .subscribe((updated) => {
          if (!updated) {
            return;
          }
          this.annotations = this.annotations.map((item) => (item.id === updated.id ? updated : item));
          this.annotationFeedback = { kind: 'success', text: 'Anotación actualizada.' };
          this.patientRealtime.publishDocumentMutation('updated', patientId, document.id);
          this.lastRealtimeSyncAt = new Date();
        })
    );
  }

  deleteAnnotation(annotation: RadiographAnnotationView): void {
    const patientId = this.selectedPatientId;
    const document = this.activeDocument;
    if (patientId == null || !document || this.annotationSaving) {
      return;
    }
    this.annotationSaving = true;
    this.annotationFeedback = null;
    this.subs.add(
      this.annotationService
        .delete(document.id, annotation.id, patientId)
        .pipe(
          finalize(() => {
            this.annotationSaving = false;
          }),
          catchError((err: unknown) => {
            this.annotationFeedback = { kind: 'error', text: this.mapAnnotationHttpError(err) };
            return of(null);
          })
        )
        .subscribe((result) => {
          if (result === null) {
            return;
          }
          this.annotations = this.annotations.filter((item) => item.id !== annotation.id);
          this.annotationFeedback = { kind: 'success', text: 'Anotación eliminada.' };
          this.patientRealtime.publishDocumentMutation('updated', patientId, document.id);
          this.lastRealtimeSyncAt = new Date();
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
        this.filteredPatients = [...patients];
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
        this.loadAppointmentsByPatient(selectedId);
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
        this.filteredPatients = [];
        this.documents = [];
        return of(null);
      })
    );
  }

  private loadDocumentsByPatient(patientId: number) {
    this.loadingDocuments = true;
    this.loadError = null;
    return this.documentService.listByPatientId(patientId).pipe(
      map((rows) =>
        rows
          .filter((row) => belongsToPatientRelationStrict(row, patientId))
          .map((row) => this.toDocumentCard(row))
          .filter((item): item is DocumentCard => item != null)
      ),
      map((cards) => this.uniqueDocumentsById(cards)),
      map((cards) => this.sortDocuments(cards)),
      map((cards) => {
        const prevActive = this.activeDocumentId;
        this.documents = cards;
        const nextActive =
          cards.find((d) => d.id === this.activeDocumentId)?.id ?? cards[0]?.id ?? null;
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
        this.loadAnnotationsForSelection(true);
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
        this.annotations = [];
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
        this.loadAnnotationsForSelection(true);
        this.lastRealtimeSyncAt = new Date();
        return null;
      })
    );
  }

  private loadAppointmentsByPatient(patientId: number): void {
    this.subs.add(
      this.appointmentService
        .listByPatientId(patientId)
        .pipe(
          map((rows) =>
            rows
              .map((row) => this.toAppointmentOption(row))
              .filter((item): item is PatientAppointmentOption => item != null)
          ),
          map((rows) => this.uniqueAppointments(rows)),
          catchError(() => of([]))
        )
        .subscribe((rows) => {
          this.appointmentsByPatient = rows;
          if (rows.length === 0) {
            this.selectedAppointmentId = null;
            this.annotations = [];
            return;
          }
          if (!rows.some((item) => item.id === this.selectedAppointmentId)) {
            this.selectedAppointmentId = rows[0].id;
          }
          this.loadAnnotationsForSelection(true);
        })
    );
  }

  private loadAnnotationsForSelection(forceReload = false): void {
    const patientId = this.selectedPatientId;
    const document = this.activeDocument;
    const appointmentId = this.selectedAppointmentId;
    if (patientId == null || !document || appointmentId == null) {
      this.annotations = [];
      this.lastLoadedAnnotationKey = null;
      return;
    }
    const selectionKey = `${patientId}:${document.id}:${appointmentId}`;
    if (!forceReload && this.lastLoadedAnnotationKey === selectionKey) {
      return;
    }
    this.lastLoadedAnnotationKey = selectionKey;
    this.loadingAnnotations = true;
    this.subs.add(
      this.annotationService
        .list(document.id, patientId, appointmentId)
        .pipe(
          map((rows) => this.sortAnnotations(rows)),
          finalize(() => {
            this.loadingAnnotations = false;
          }),
          catchError((err: unknown) => {
            this.annotationFeedback = { kind: 'error', text: this.mapAnnotationHttpError(err) };
            return of([]);
          })
        )
        .subscribe((rows) => {
          this.annotations = rows;
          this.lastRealtimeSyncAt = new Date();
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
    const type = this.pickString(row, ['type', 'mimeType', 'mime_type']) || 'Sin tipo';
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
      captureDateLabel: captureDate
        ? new Intl.DateTimeFormat('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }).format(captureDate)
        : 'Sin fecha',
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

  private renderViewerAsset(doc: DocumentCard): void {
    if (this.selectedPatientId == null) {
      return;
    }
    this.revokeViewerObjectUrl();
    this.viewerImageUrl = null;
    this.viewerAssetKind = 'none';
    this.viewerDownloadName = doc.displayName || `documento-${doc.id}`;
    this.loadingViewerAsset = true;
    this.subs.add(
      this.documentService
        .download(doc.id, this.selectedPatientId)
        .pipe(
          finalize(() => {
            this.loadingViewerAsset = false;
          }),
          catchError((err: unknown) => {
            this.viewerImageUrl = null;
            this.viewerAssetKind = 'none';
            this.loadError = this.mapDocumentHttpError(err, 'download');
            return of(null);
          })
        )
        .subscribe((blob) => {
          if (!blob) {
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          this.viewerObjectUrl = objectUrl;
          this.viewerImageUrl = objectUrl;
          const mime = blob.type.toLowerCase();
          if (doc.iconKind === 'image' || mime.startsWith('image/')) {
            this.viewerAssetKind = 'image';
            this.prepareSnapMapFromImage(objectUrl);
            return;
          }
          if (doc.iconKind === 'pdf' || mime.includes('pdf')) {
            this.viewerAssetKind = 'pdf';
            this.clearSnapMap();
            return;
          }
          this.viewerAssetKind = 'other';
          this.clearSnapMap();
        })
    );
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
          finalize(() => {
            this.uploadingFiles = false;
          }),
          catchError((err: unknown) => {
            this.uploadFeedback = {
              kind: 'error',
              text: this.mapDocumentHttpError(err, 'upload'),
            };
            return of(null);
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
                ? 'Documento subido correctamente.'
                : `${validFiles.length} documentos subidos.`,
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
            ? 'Los archivos seleccionados están vacíos.'
            : 'Selecciona al menos un archivo para subir.',
      };
      return null;
    }
    const oversized = nonEmpty.find((file) => file.size > DOCUMENT_MAX_UPLOAD_BYTES);
    if (oversized) {
      this.uploadFeedback = {
        kind: 'error',
        text: `El archivo ${oversized.name} supera el máximo permitido (${Math.round(
          DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024)
        )} MB).`,
      };
      return null;
    }
    return nonEmpty;
  }

  private revokeViewerObjectUrl(): void {
    if (this.viewerObjectUrl) {
      URL.revokeObjectURL(this.viewerObjectUrl);
      this.viewerObjectUrl = null;
    }
  }

  private resetViewerAdjustments(): void {
    this.zoomLevel = 1;
  }

  private clearMeasurement(): void {
    this.measurePointA = null;
    this.measurePointB = null;
    this.measureHoverPoint = null;
    this.lastMeasuredCm = null;
    this.liveMeasuredCm = null;
  }

  private clearCalibrationSelection(): void {
    this.calibrationPointA = null;
    this.calibrationPointB = null;
    this.calibrationHoverPoint = null;
  }

  private registerCalibrationPoint(point: MeasurePoint, widthPx: number, heightPx: number): void {
    if (!this.calibrationPointA || this.calibrationPointB) {
      this.calibrationPointA = point;
      this.calibrationPointB = null;
      this.calibrationHoverPoint = null;
      return;
    }

    this.calibrationPointB = point;
    this.calibrationHoverPoint = null;
    const calculated = this.calculatePxPerCmFromCalibration(widthPx, heightPx);
    if (calculated != null) {
      this.pxPerCm = calculated;
      this.persistCalibrationForCurrentSelection();
      if (this.measurePointA && this.measurePointB) {
        this.lastMeasuredCm = this.calculateMeasurementCm(widthPx, heightPx);
      }
    }
  }

  private clampZoom(value: number): number {
    return Math.max(0.5, Math.min(3, Number(value.toFixed(2))));
  }

  private applyTrackpadZoom(event: WheelEvent): void {
    if (!this.activeDocument) {
      return;
    }
    // En trackpads, el gesto de pinza suele llegar como wheel con ctrl/meta pulsado.
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY;
    if (delta === 0) {
      return;
    }
    const stepBase = Math.max(0.04, Math.min(0.18, Math.abs(delta) / 600));
    const step = delta < 0 ? stepBase : -stepBase;
    this.zoomLevel = this.clampZoom(this.zoomLevel + step);
  }

  private calculateMeasurementCm(widthPx: number, heightPx: number): number | null {
    if (!this.measurePointA || !this.measurePointB || widthPx <= 0 || heightPx <= 0) {
      return null;
    }
    return this.calculateMeasurementCmFromPoints(this.measurePointA, this.measurePointB, widthPx, heightPx);
  }

  private calculatePxPerCmFromCalibration(widthPx: number, heightPx: number): number | null {
    if (!this.calibrationPointA || !this.calibrationPointB || widthPx <= 0 || heightPx <= 0) {
      return null;
    }
    const dx = (this.calibrationPointB.xPct - this.calibrationPointA.xPct) * widthPx;
    const dy = (this.calibrationPointB.yPct - this.calibrationPointA.yPct) * heightPx;
    const distancePxScaled = Math.sqrt(dx * dx + dy * dy);
    const distancePxReal = distancePxScaled / this.zoomLevel;
    if (!Number.isFinite(distancePxReal) || distancePxReal <= 0 || this.calibrationReferenceCm <= 0) {
      return null;
    }
    const pxPerCm = distancePxReal / this.calibrationReferenceCm;
    return Math.max(1, Math.min(500, Number(pxPerCm.toFixed(2))));
  }

  private applySnapToPoint(point: MeasurePoint, stageWidth: number, stageHeight: number): MeasurePoint {
    if (!this.snapEnabled || !this.snapGrayMap || this.snapMapWidth < 3 || this.snapMapHeight < 3) {
      return point;
    }
    if (stageWidth <= 0 || stageHeight <= 0) {
      return point;
    }
    const config = this.getSnapSensitivityConfig();

    const cx = Math.round(point.xPct * (this.snapMapWidth - 1));
    const cy = Math.round(point.yPct * (this.snapMapHeight - 1));
    const radiusX = Math.max(
      1,
      Math.min(24, Math.round((config.searchRadiusPx * this.snapMapWidth) / stageWidth))
    );
    const radiusY = Math.max(
      1,
      Math.min(24, Math.round((config.searchRadiusPx * this.snapMapHeight) / stageHeight))
    );

    let bestX = cx;
    let bestY = cy;
    let bestScore = -1;

    const minX = Math.max(1, cx - radiusX);
    const maxX = Math.min(this.snapMapWidth - 2, cx + radiusX);
    const minY = Math.max(1, cy - radiusY);
    const maxY = Math.min(this.snapMapHeight - 2, cy + radiusY);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const score = this.edgeScoreAt(x, y);
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    if (bestScore < config.minEdgeScore) {
      return point;
    }

    return {
      xPct: bestX / (this.snapMapWidth - 1),
      yPct: bestY / (this.snapMapHeight - 1),
    };
  }

  private getSnapSensitivityConfig(): { searchRadiusPx: number; minEdgeScore: number } {
    switch (this.effectiveSnapSensitivity) {
      case 'low':
        return { searchRadiusPx: 6, minEdgeScore: 50 };
      case 'high':
        return { searchRadiusPx: 14, minEdgeScore: 22 };
      default:
        return { searchRadiusPx: 10, minEdgeScore: 35 };
    }
  }

  private get effectiveSnapSensitivity(): SnapSensitivity {
    if (this.snapSensitivityMode === 'manual') {
      return this.snapSensitivity;
    }
    return this.resolveAutoSnapSensitivity();
  }

  private resolveAutoSnapSensitivity(): SnapSensitivity {
    const doc = this.activeDocument;
    if (!doc) {
      return 'medium';
    }
    if (doc.shortTag === 'PAN') {
      return 'high';
    }
    if (doc.shortTag === 'BW') {
      return 'low';
    }
    if (doc.shortTag === 'PA') {
      return 'medium';
    }
    return 'medium';
  }

  private edgeScoreAt(x: number, y: number): number {
    if (!this.snapGrayMap || x <= 0 || y <= 0 || x >= this.snapMapWidth - 1 || y >= this.snapMapHeight - 1) {
      return 0;
    }
    const row = this.snapMapWidth;
    const idx = y * row + x;
    const gx = Math.abs(this.snapGrayMap[idx + 1] - this.snapGrayMap[idx - 1]);
    const gy = Math.abs(this.snapGrayMap[idx + row] - this.snapGrayMap[idx - row]);
    return gx + gy;
  }

  private prepareSnapMapFromImage(imageUrl: string): void {
    const seq = ++this.snapLoadSeq;
    const image = new Image();
    image.onload = () => {
      if (seq !== this.snapLoadSeq) {
        return;
      }
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      if (!naturalWidth || !naturalHeight) {
        this.clearSnapMap();
        return;
      }

      const maxDim = 1100;
      const scale = Math.min(1, maxDim / Math.max(naturalWidth, naturalHeight));
      const w = Math.max(4, Math.round(naturalWidth * scale));
      const h = Math.max(4, Math.round(naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        this.clearSnapMap();
        return;
      }
      ctx.drawImage(image, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const gray = new Uint8ClampedArray(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        gray[p] = Math.round((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
      }
      this.snapGrayMap = gray;
      this.snapMapWidth = w;
      this.snapMapHeight = h;
    };
    image.onerror = () => {
      if (seq !== this.snapLoadSeq) {
        return;
      }
      this.clearSnapMap();
    };
    image.src = imageUrl;
  }

  private clearSnapMap(): void {
    this.snapGrayMap = null;
    this.snapMapWidth = 0;
    this.snapMapHeight = 0;
  }

  private calculateMeasurementCmFromPoints(
    pointA: MeasurePoint,
    pointB: MeasurePoint,
    widthPx: number,
    heightPx: number
  ): number | null {
    if (widthPx <= 0 || heightPx <= 0 || this.pxPerCm <= 0) {
      return null;
    }
    const dx = (pointB.xPct - pointA.xPct) * widthPx;
    const dy = (pointB.yPct - pointA.yPct) * heightPx;
    const distancePxScaled = Math.sqrt(dx * dx + dy * dy);
    const distancePxReal = distancePxScaled / this.zoomLevel;
    if (!Number.isFinite(distancePxReal) || distancePxReal <= 0) {
      return null;
    }
    return distancePxReal / this.pxPerCm;
  }

  private getActiveMeasureEndPoint(): MeasurePoint | null {
    return this.measurePointB ?? this.measureHoverPoint;
  }

  private getActiveCalibrationEndPoint(): MeasurePoint | null {
    return this.calibrationPointB ?? this.calibrationHoverPoint;
  }

  private toStagePoint(event: MouseEvent, rect: DOMRect): MeasurePoint | null {
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const xPct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const yPct = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return { xPct, yPct };
  }

  private persistCalibrationForCurrentSelection(): void {
    if (!this.calibrationLocked) {
      return;
    }
    const active = this.activeDocument;
    const patientId = this.selectedPatientId;
    if (!active || patientId == null) {
      return;
    }
    this.persistCalibration(patientId, active);
  }

  private persistCalibration(patientId: number, doc: DocumentCard): void {
    const payload = JSON.stringify({
      pxPerCm: this.pxPerCm,
      updatedAt: Date.now(),
    });
    const documentKey = this.buildCalibrationDocumentKey(patientId, doc.id);
    const typeKey = this.buildCalibrationTypeKey(patientId, doc.shortTag);
    try {
      localStorage.setItem(documentKey, payload);
      localStorage.setItem(typeKey, payload);
      localStorage.setItem(this.buildCalibrationLockStateKey(patientId, doc.id), '1');
    } catch {
      // Storage may be unavailable.
    }
  }

  private applyStoredCalibrationForDocument(doc: DocumentCard): void {
    const patientId = this.selectedPatientId;
    if (patientId == null) {
      return;
    }
    try {
      const lockRaw = localStorage.getItem(this.buildCalibrationLockStateKey(patientId, doc.id));
      this.calibrationLocked = lockRaw !== '0';
      const fromDocument = this.readStoredPxPerCm(
        localStorage.getItem(this.buildCalibrationDocumentKey(patientId, doc.id))
      );
      const fromType = this.readStoredPxPerCm(
        localStorage.getItem(this.buildCalibrationTypeKey(patientId, doc.shortTag))
      );
      const next = fromDocument ?? fromType;
      if (next != null) {
        this.pxPerCm = next;
      }
    } catch {
      // Storage may be unavailable.
    }
  }

  private persistSnapSensitivityForCurrentDocument(): void {
    const patientId = this.selectedPatientId;
    const doc = this.activeDocument;
    if (patientId == null || !doc) {
      return;
    }
    const payload = JSON.stringify({
      mode: this.snapSensitivityMode,
      manualValue: this.snapSensitivity,
      updatedAt: Date.now(),
    });
    try {
      localStorage.setItem(this.buildSnapSensitivityDocumentKey(patientId, doc.id), payload);
    } catch {
      // Storage may be unavailable.
    }
  }

  private applyStoredSnapSensitivityForDocument(doc: DocumentCard): void {
    const patientId = this.selectedPatientId;
    if (patientId == null) {
      return;
    }
    try {
      const raw = localStorage.getItem(this.buildSnapSensitivityDocumentKey(patientId, doc.id));
      if (!raw) {
        this.snapSensitivityMode = 'auto';
        this.snapSensitivity = 'medium';
        return;
      }
      const parsed = JSON.parse(raw) as { mode?: unknown; manualValue?: unknown };
      const mode: SnapSensitivityMode = parsed.mode === 'manual' ? 'manual' : 'auto';
      this.snapSensitivityMode = mode;
      if (
        parsed.manualValue === 'low' ||
        parsed.manualValue === 'medium' ||
        parsed.manualValue === 'high'
      ) {
        this.snapSensitivity = parsed.manualValue;
      }
    } catch {
      this.snapSensitivityMode = 'auto';
      this.snapSensitivity = 'medium';
    }
  }

  private clearStoredCalibrationLock(patientId: number, doc: DocumentCard): void {
    try {
      localStorage.setItem(this.buildCalibrationLockStateKey(patientId, doc.id), '0');
    } catch {
      // Storage may be unavailable.
    }
  }

  private readStoredPxPerCm(raw: string | null): number | null {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as { pxPerCm?: unknown };
      const value = Number(parsed.pxPerCm);
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      return Math.max(1, Math.min(500, value));
    } catch {
      return null;
    }
  }

  private buildCalibrationDocumentKey(patientId: number, documentId: number): string {
    return `${CALIBRATION_LOCK_STORAGE_PREFIX}:patient:${patientId}:document:${documentId}`;
  }

  private buildCalibrationTypeKey(patientId: number, shortTag: string): string {
    const safeTag = String(shortTag || 'DOC').toUpperCase();
    return `${CALIBRATION_LOCK_STORAGE_PREFIX}:patient:${patientId}:type:${safeTag}`;
  }

  private buildCalibrationLockStateKey(patientId: number, documentId: number): string {
    return `${CALIBRATION_LOCK_STORAGE_PREFIX}:patient:${patientId}:document:${documentId}:locked`;
  }

  private buildSnapSensitivityDocumentKey(patientId: number, documentId: number): string {
    return `${SNAP_SENSITIVITY_STORAGE_PREFIX}:patient:${patientId}:document:${documentId}`;
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
      /\.(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff)$/i.test(displayName)
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

  private parseNotesFromDescription(description: string): string[] {
    return description
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private toAppointmentOption(raw: unknown): PatientAppointmentOption | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const row = raw as Record<string, unknown>;
    const id = Number(row['id']);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    const when = this.pickString(row, ['startTime', 'date', 'appointmentDate', 'appointment_date']);
    return {
      id,
      label: when ? `Visita #${id} · ${when}` : `Visita #${id}`,
    };
  }

  private uniqueAppointments(rows: PatientAppointmentOption[]): PatientAppointmentOption[] {
    const seen = new Set<number>();
    const out: PatientAppointmentOption[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      out.push(row);
    }
    return out;
  }

  private buildMeasurementPayload(): Record<string, unknown> | null {
    if (!this.measurePointA || !this.measurePointB || this.lastMeasuredCm == null) {
      return null;
    }
    return {
      points: {
        from: this.measurePointA,
        to: this.measurePointB,
      },
      metrics: {
        cm: Number(this.lastMeasuredCm.toFixed(3)),
        pxPerCm: this.pxPerCm,
        zoom: this.zoomLevel,
      },
    };
  }

  private sortAnnotations(rows: RadiographAnnotationView[]): RadiographAnnotationView[] {
    return [...rows].sort((a, b) => {
      const tA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const tB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      if (tA !== tB) {
        return tB - tA;
      }
      return b.id - a.id;
    });
  }

  private mapAnnotationHttpError(err: unknown): string {
    const http = err as HttpErrorResponse;
    if (http?.status === 400) {
      return 'Datos de anotación inválidos. Revisa visita, documento y contenido.';
    }
    if (http?.status === 401) {
      return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
    }
    if (http?.status === 403) {
      return 'No tienes permisos o hay mismatch paciente/visita/documento.';
    }
    if (http?.status === 404) {
      return 'La anotación o la visita asociada no existe.';
    }
    if (http?.status === 0) {
      return 'No se pudo conectar con el servidor para guardar la anotación.';
    }
    return 'No se pudo procesar la anotación radiográfica.';
  }

  private formatNowForNote(): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  }

  private mapDocumentHttpError(
    err: unknown,
    context: 'list' | 'upload' | 'noteUpdate' | 'delete' | 'download'
  ): string {
    const http = err as HttpErrorResponse;
    if (http?.status === 401) {
      return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
    }
    if (http?.status === 403) {
      return 'No tienes permisos clínicos para esta operación.';
    }
    if (http?.status === 404) {
      return 'El recurso solicitado ya no existe o no está disponible.';
    }
    if (http?.status === 409) {
      return context === 'delete'
        ? 'No se pudo borrar el documento por un conflicto de almacenamiento.'
        : 'Se detectó un conflicto al procesar el documento. Inténtalo de nuevo.';
    }
    if (http?.status === 413) {
      const max = Number((http.error as { maxUploadBytes?: unknown } | null)?.maxUploadBytes);
      if (Number.isFinite(max) && max > 0) {
        return `El archivo supera el límite del servidor (${Math.round(max / (1024 * 1024))} MB).`;
      }
      return 'El archivo supera el tamaño máximo permitido por el servidor.';
    }
    if (http?.status === 400) {
      if (context === 'upload') {
        return 'Solicitud de subida inválida. Revisa archivo, paciente y metadatos.';
      }
      if (context === 'list') {
        return 'El backend requiere filtrar documentos por paciente. Recarga seleccionando un paciente.';
      }
      return 'Solicitud inválida. Revisa los datos e inténtalo de nuevo.';
    }
    if (http?.status === 0) {
      return 'No se pudo conectar con el servidor.';
    }
    if (context === 'noteUpdate') {
      return 'No se pudo guardar la nota clínica.';
    }
    if (context === 'upload') {
      return 'No se pudieron subir uno o más documentos.';
    }
    if (context === 'download') {
      return 'No se pudo descargar o previsualizar el documento seleccionado.';
    }
    return 'No se pudieron cargar los documentos del paciente seleccionado.';
  }
}

