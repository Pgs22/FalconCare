import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { concatMap, from, map, of, switchMap, toArray } from 'rxjs';
import {
  OdontogramFace,
  OdontogramFaceInteraction,
  OdontogramFaceStatus,
  OdontogramToothComponent,
  OdontogramToothState,
} from '../../shared/odontogram-tooth/odontogram-tooth';
import { AppointmentService } from '../../services/appointment.service';
import { PathologyTypeItem, PathologyTypeService } from '../../services/pathology-type.service';
import {
  OdontogramApi,
  OdontogramDetailApi,
  OdontogramService,
  OpenOdontogramResponse,
  SyncOdontogramEntry,
} from '../../services/odontogram.service';

type ToothStatus = OdontogramFaceStatus;

type ToothItem = {
  id: string;
  label: string;
};

type Quadrant = {
  id: string;
  title: string;
  permanent: ToothItem[];
  temporary: ToothItem[];
  side: 'left' | 'right';
};

type ProtocolItem = {
  id: number;
  label: string;
  accentColor: string;
};

type FaceMark = {
  pathologyTypeId: number;
  pathologyId: number | null;
  pathologyLabel: string;
  color: string;
  visualType: string | null;
};

type ColorMode = {
  id: 'pending' | 'done';
  label: string;
  color: string;
  visualType: string;
};

type TreatmentItem = {
  id: number;
  name: string;
  pathologyTypeName: string;
  duration: number | null;
  status: string | null;
  description?: string | null;
  notes?: string | null;
  isPending?: boolean;
};

type TreatmentDraft = {
  name: string;
  description: string;
  duration: number;
  status: string;
  notes: string;
};

@Component({
  selector: 'app-odontogram',
  standalone: true,
  imports: [CommonModule, FormsModule, OdontogramToothComponent],
  templateUrl: './odontogram.html',
  styleUrl: './odontogram.css',
})
export class OdontogramComponent implements OnInit {
  private readonly appointmentService = inject(AppointmentService);
  private readonly pathologyTypeService = inject(PathologyTypeService);
  private readonly odontogramService = inject(OdontogramService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private pendingLoadCount = 0;
  private readonly protocolCatalog = new Map<number, ProtocolItem>();
  private readonly manuallyAddedProtocolIds = new Set<number>();
  private readonly faceMarkMap = new Map<string, FaceMark>();
  private readonly batchSelection = new Set<string>();

  isLoading = true;
  isSaving = false;
  isProtocolPickerOpen = false;
  isEraseMode = false;
  isBatchSelectionMode = false;
  isBatchSelecting = false;
  isTreatmentsModalOpen = false;
  isTreatmentsLoading = false;
  isTreatmentFormOpen = false;
  isCreatingTreatment = false;
  isTreatmentStatusModalOpen = false;
  isUpdatingTreatmentStatus = false;
  loadError: string | null = null;
  saveFeedback: string | null = null;
  treatmentsError: string | null = null;
  treatmentFormError: string | null = null;
  treatmentFormSuccess: string | null = null;
  treatmentStatusError: string | null = null;
  odontogramId: number | null = null;
  patientId: number | null = null;
  visitId: number | null = null;
  selectedProtocolId: number | null = null;
  selectedColorModeId: ColorMode['id'] = 'pending';
  treatments: TreatmentItem[] = [];
  persistedTreatments: TreatmentItem[] = [];
  treatmentDraft: TreatmentDraft = this.createEmptyTreatmentDraft();
  editingTreatmentId: number | null = null;
  selectedTreatmentForStatus: TreatmentItem | null = null;
  editingTreatmentStatus = 'Actiu';
  private nextPendingTreatmentId = -1;
  private readonly pendingCreatedTreatments: TreatmentItem[] = [];
  private readonly pendingTreatmentStatusUpdates = new Map<number, string>();
  private readonly pendingDeletedTreatmentIds = new Set<number>();

  readonly protocolsFallback: ProtocolItem[] = [
    { id: 1, label: 'Càries', accentColor: '#FF0000' },
    { id: 3, label: 'Endodòncia', accentColor: '#9B8CFF' },
    { id: 2, label: 'Neteja', accentColor: '#62D5E2' },
  ];

  protocols: ProtocolItem[] = [];

  readonly colorModes: ColorMode[] = [
    { id: 'pending', label: 'Pendent', color: '#FF0000', visualType: 'Pendent' },
    { id: 'done', label: 'Fet', color: '#6EC6E8', visualType: 'Fet' },
  ];

  readonly topQuadrants: Quadrant[] = [
    {
      id: 'q1',
      title: 'Quadrant superior dret',
      side: 'left',
      permanent: this.createTeeth(['18', '17', '16', '15', '14', '13', '12', '11']),
      temporary: this.createTeeth(['55', '54', '53', '52', '51']),
    },
    {
      id: 'q2',
      title: 'Quadrant superior esquerre',
      side: 'right',
      permanent: this.createTeeth(['21', '22', '23', '24', '25', '26', '27', '28']),
      temporary: this.createTeeth(['61', '62', '63', '64', '65']),
    },
  ];

  readonly bottomQuadrants: Quadrant[] = [
    {
      id: 'q4',
      title: 'Quadrant inferior dret',
      side: 'left',
      permanent: this.createTeeth(['48', '47', '46', '45', '44', '43', '42', '41']),
      temporary: this.createTeeth(['85', '84', '83', '82', '81']),
    },
    {
      id: 'q3',
      title: 'Quadrant inferior esquerre',
      side: 'right',
      permanent: this.createTeeth(['31', '32', '33', '34', '35', '36', '37', '38']),
      temporary: this.createTeeth(['71', '72', '73', '74', '75']),
    },
  ];

  selectedTooth = this.topQuadrants[0].permanent[0];

  ngOnInit(): void {
    this.loadPathologyTypes();
    this.loadOdontogramFromRoute();
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    this.isBatchSelecting = false;
    this.batchSelection.clear();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeTreatmentsModal();
  }

  selectTooth(tooth: ToothItem): void {
    this.selectedTooth = tooth;
  }

  selectProtocol(protocol: ProtocolItem): void {
    if (this.selectedProtocolId === protocol.id) {
      this.selectedProtocolId = null;
      this.isEraseMode = false;
      this.isProtocolPickerOpen = false;
      this.saveFeedback = null;
      this.rebuildVisibleProtocols();
      return;
    }

    this.selectedProtocolId = protocol.id;
    this.isEraseMode = false;
    this.isProtocolPickerOpen = false;
    this.saveFeedback = null;
  }

  toggleProtocolPicker(): void {
    this.isProtocolPickerOpen = !this.isProtocolPickerOpen;
  }

  addProtocol(protocol: ProtocolItem): void {
    this.manuallyAddedProtocolIds.add(protocol.id);
    this.rebuildVisibleProtocols();
    this.selectProtocol(protocol);
  }

  toggleEraseMode(): void {
    if (!this.selectedProtocolId) {
      return;
    }

    this.isEraseMode = !this.isEraseMode;
    this.saveFeedback = null;
  }

  toggleBatchSelectionMode(): void {
    this.isBatchSelectionMode = !this.isBatchSelectionMode;
    this.clearBatchSelection();
  }

  openTreatmentsModal(): void {
    if (!this.patientId) {
      this.treatmentsError = 'No s\'han pogut identificar els tractaments del pacient.';
      this.isTreatmentsModalOpen = true;
      return;
    }

    this.isTreatmentsModalOpen = true;
    this.isTreatmentsLoading = true;
    this.treatmentsError = null;
    this.treatmentFormError = null;
    this.treatmentFormSuccess = null;

    this.odontogramService.getPatientTreatments(this.patientId).subscribe({
      next: (response: unknown) => {
        const list = Array.isArray(response) ? response : [];
        this.persistedTreatments = list
          .map((item) => this.mapTreatmentItem(item))
          .filter((item): item is TreatmentItem => item !== null);
        this.rebuildTreatmentsList();
        this.isTreatmentsLoading = false;
      },
      error: (error: unknown) => {
        console.error('Failed to load patient treatments for odontogram.', error);
        this.persistedTreatments = [];
        this.rebuildTreatmentsList();
        this.treatmentsError = 'No s\'han pogut carregar els tractaments del pacient.';
        this.isTreatmentsLoading = false;
      },
    });
  }

  closeTreatmentsModal(): void {
    this.isTreatmentsModalOpen = false;
    this.isTreatmentFormOpen = false;
    this.isCreatingTreatment = false;
    this.closeTreatmentStatusModal();
    this.treatmentFormError = null;
    this.treatmentFormSuccess = null;
    this.treatmentDraft = this.createEmptyTreatmentDraft();
  }

  trackByTreatment(_index: number, treatment: TreatmentItem): number {
    return treatment.id;
  }

  openTreatmentForm(): void {
    this.isTreatmentsModalOpen = true;
    this.isTreatmentFormOpen = true;
    this.isTreatmentsLoading = true;
    this.closeTreatmentStatusModal();
    this.treatmentsError = null;
    this.treatmentFormError = null;
    this.treatmentFormSuccess = null;
    this.treatmentDraft = this.createEmptyTreatmentDraft();
    this.reloadTreatments();
  }

  openCreateTreatmentModal(): void {
    this.openTreatmentForm();
  }

  cancelTreatmentForm(): void {
    this.isTreatmentFormOpen = false;
    this.isCreatingTreatment = false;
    this.treatmentFormError = null;
    this.treatmentFormSuccess = null;
    this.treatmentDraft = this.createEmptyTreatmentDraft();
  }

  editTreatment(treatment: TreatmentItem): void {
    this.selectedTreatmentForStatus = treatment;
    this.editingTreatmentId = treatment.id;
    this.editingTreatmentStatus = treatment.status ?? 'Actiu';
    this.treatmentStatusError = null;
    this.isTreatmentStatusModalOpen = true;
  }

  submitTreatmentForm(): void {
    const name = this.treatmentDraft.name.trim();
    const description = this.treatmentDraft.description.trim();
    const duration = Number(this.treatmentDraft.duration);
    const status = this.treatmentDraft.status.trim();

    if (!this.visitId) {
      this.treatmentFormError = 'No s\'ha trobat la cita oberta per vincular el tractament.';
      return;
    }

    if (!name) {
      this.treatmentFormError = 'El nom del tractament és obligatori.';
      return;
    }

    if (!description) {
      this.treatmentFormError = 'La descripció del tractament és obligatòria.';
      return;
    }

    if (!Number.isFinite(duration) || duration < 1) {
      this.treatmentFormError = 'La durada ha de ser superior a 0 minuts.';
      return;
    }

    if (!status) {
      this.treatmentFormError = 'L\'estat del tractament és obligatori.';
      return;
    }

    this.isCreatingTreatment = true;
    this.treatmentFormError = null;
    this.treatmentFormSuccess = null;

    this.odontogramService.createTreatment({
      treatmentName: name,
      description,
      estimatedDuration: duration,
      status,
      schedulingNotes: this.treatmentDraft.notes.trim() || null,
      pathology_ids: this.getLinkedPathologyIds(),
      appointment_id: this.visitId,
    });

    const pendingTreatment: TreatmentItem = {
      id: this.nextPendingTreatmentId--,
      name,
      pathologyTypeName: this.getPendingTreatmentPathologyLabel(),
      duration,
      status,
      description,
      notes: this.treatmentDraft.notes.trim() || null,
      isPending: true,
    };

    this.pendingCreatedTreatments.push(pendingTreatment);
    this.rebuildTreatmentsList();
    this.treatmentFormSuccess = 'Tractament preparat. Es desarà en tancar la cita.';
    this.isCreatingTreatment = false;
    this.isTreatmentFormOpen = false;
    this.treatmentDraft = this.createEmptyTreatmentDraft();
  }

  closeTreatmentStatusModal(): void {
    this.isTreatmentStatusModalOpen = false;
    this.isUpdatingTreatmentStatus = false;
    this.selectedTreatmentForStatus = null;
    this.editingTreatmentId = null;
    this.editingTreatmentStatus = 'Actiu';
    this.treatmentStatusError = null;
  }

  submitTreatmentStatusUpdate(): void {
    if (!this.editingTreatmentId) {
      this.treatmentStatusError = 'No s\'ha trobat el tractament a editar.';
      return;
    }

    const status = this.editingTreatmentStatus.trim();
    if (!status) {
      this.treatmentStatusError = 'L\'estat del tractament és obligatori.';
      return;
    }

    this.isUpdatingTreatmentStatus = true;
    this.treatmentStatusError = null;

    if (this.editingTreatmentId < 0) {
      const pendingTreatment = this.pendingCreatedTreatments.find((treatment) => treatment.id === this.editingTreatmentId);
      if (pendingTreatment) {
        pendingTreatment.status = status;
      }
    } else {
      this.pendingDeletedTreatmentIds.delete(this.editingTreatmentId);
      this.pendingTreatmentStatusUpdates.set(this.editingTreatmentId, status);
    }

    this.rebuildTreatmentsList();
    this.isUpdatingTreatmentStatus = false;
    this.treatmentFormSuccess = 'Estat preparat. Es desarà en tancar la cita.';
    this.closeTreatmentStatusModal();
  }

  deleteTreatmentFromStatusModal(): void {
    if (!this.editingTreatmentId) {
      this.treatmentStatusError = 'No s\'ha trobat el tractament a esborrar.';
      return;
    }

    if (this.editingTreatmentId < 0) {
      const pendingIndex = this.pendingCreatedTreatments.findIndex((treatment) => treatment.id === this.editingTreatmentId);
      if (pendingIndex >= 0) {
        this.pendingCreatedTreatments.splice(pendingIndex, 1);
      }
    } else {
      this.pendingDeletedTreatmentIds.add(this.editingTreatmentId);
      this.pendingTreatmentStatusUpdates.delete(this.editingTreatmentId);
    }

    this.rebuildTreatmentsList();
    this.treatmentFormSuccess = 'Tractament marcat per esborrar. Es desarà en tancar la cita.';
    this.closeTreatmentStatusModal();
  }

  getLinkedPathologyCount(): number {
    return this.getLinkedPathologyIds().length;
  }

  clearBatchSelection(): void {
    this.batchSelection.clear();
    this.isBatchSelecting = false;
  }

  selectColorMode(mode: ColorMode): void {
    this.selectedColorModeId = mode.id;
    this.isEraseMode = false;
    this.saveFeedback = null;
  }

  toggleFace(tooth: ToothItem, face: OdontogramFace, event?: Event): void {
    event?.stopPropagation();
    this.selectedTooth = tooth;
    this.saveFeedback = null;

    if (this.isBatchSelectionMode) {
      return;
    }

    if (!this.selectedProtocolId) {
      return;
    }

    const faceKey = this.getStoredFaceKey(tooth.id, face, this.selectedProtocolId);

    if (this.isEraseMode) {
      this.faceMarkMap.delete(faceKey);
      this.rebuildVisibleProtocols();
      return;
    }

    const protocol = this.getProtocolById(this.selectedProtocolId);
    const colorMode = this.getSelectedColorMode();
    if (!protocol || !colorMode) {
      return;
    }

    const existingMark = this.faceMarkMap.get(faceKey);
    if (existingMark && existingMark.color === colorMode.color) {
      return;
    }

    this.faceMarkMap.set(faceKey, {
      pathologyTypeId: protocol.id,
      pathologyId: existingMark?.color === colorMode.color ? existingMark.pathologyId : null,
      pathologyLabel: protocol.label,
      color: colorMode.color,
      visualType: colorMode.visualType,
    });

    this.rebuildVisibleProtocols();
  }

  handleFaceInteraction(tooth: ToothItem, interaction: OdontogramFaceInteraction): void {
    if (!this.isBatchSelectionMode || !this.selectedProtocolId) {
      return;
    }

    this.selectedTooth = tooth;
    const selectionKey = this.getSelectionKey(tooth.id, interaction.face);

    if (interaction.phase === 'start') {
      this.isBatchSelecting = true;
      this.batchSelection.add(selectionKey);
      this.applyFaceChange(tooth.id, interaction.face);
      return;
    }

    if (!this.isBatchSelecting) {
      return;
    }

    if (this.batchSelection.has(selectionKey)) {
      return;
    }

    this.batchSelection.add(selectionKey);
    this.applyFaceChange(tooth.id, interaction.face);
  }

  onCloseOdontogram(): void {
    if (!this.odontogramId || !this.visitId || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.saveFeedback = null;

    this.persistPendingTreatmentChanges()
      .pipe(
        switchMap(() => this.odontogramService.syncDetails(this.odontogramId!, this.buildSyncEntries())),
        switchMap(() => this.odontogramService.getOdontogram(this.odontogramId!)),
        switchMap((odontogram: OdontogramApi) => {
          this.applyOdontogramState(odontogram);
          return this.appointmentService.closeAppointment(this.visitId!);
        })
      )
      .subscribe({
        next: async () => {
          this.isSaving = false;
          await this.router.navigate(['/appointments']);
        },
        error: (error: unknown) => {
          console.error('Failed to synchronize the odontogram or close the appointment.', error);
          this.isSaving = false;
          this.saveFeedback = 'No s\'ha pogut guardar l\'odontograma o tancar la cita.';
        },
      });
  }

  getFaceStatus(tooth: ToothItem, face: OdontogramFace): ToothStatus | null {
    if (!this.selectedProtocolId) {
      return null;
    }

    return this.faceMarkMap.get(this.getStoredFaceKey(tooth.id, face, this.selectedProtocolId))?.color ?? null;
  }

  getToothState(tooth: ToothItem): OdontogramToothState {
    return {
      M: this.getFaceStatus(tooth, 'M'),
      O: this.getFaceStatus(tooth, 'O'),
      D: this.getFaceStatus(tooth, 'D'),
      V: this.getFaceStatus(tooth, 'V'),
      L: this.getFaceStatus(tooth, 'L'),
    };
  }

  getSelectedProtocol(): ProtocolItem | null {
    return this.selectedProtocolId ? this.getProtocolById(this.selectedProtocolId) : null;
  }

  getSelectedColorMode(): ColorMode | null {
    return this.colorModes.find((mode) => mode.id === this.selectedColorModeId) ?? null;
  }

  getAvailableProtocolsToAdd(): ProtocolItem[] {
    const visibleProtocolIds = new Set(this.protocols.map((protocol) => protocol.id));

    return Array.from(this.protocolCatalog.values())
      .filter((protocol) => !visibleProtocolIds.has(protocol.id))
      .sort((left, right) => this.getProtocolOrder(left.label) - this.getProtocolOrder(right.label));
  }

  hasVisibleProtocols(): boolean {
    return this.protocols.length > 0;
  }

  trackByTooth(_index: number, tooth: ToothItem): string {
    return tooth.id;
  }

  trackByQuadrant(_index: number, quadrant: Quadrant): string {
    return quadrant.id;
  }

  trackByProtocol(_index: number, protocol: ProtocolItem): number {
    return protocol.id;
  }

  trackByColorMode(_index: number, colorMode: ColorMode): string {
    return colorMode.id;
  }

  private loadPathologyTypes(): void {
    this.beginLoading();

    this.pathologyTypeService.list().subscribe({
      next: (pathologyTypes) => {
        this.protocolCatalog.clear();

        const mappedProtocols = pathologyTypes
          .map((pathologyType) => this.mapPathologyTypeToProtocol(pathologyType))
          .filter((protocol): protocol is ProtocolItem => protocol !== null);

        const sourceProtocols = mappedProtocols.length > 0 ? mappedProtocols : this.protocolsFallback;
        for (const protocol of sourceProtocols) {
          this.protocolCatalog.set(protocol.id, protocol);
        }

        this.rebuildVisibleProtocols();
        this.finishLoading();
      },
      error: (error) => {
        console.error('Failed to load pathology types for odontogram protocol.', error);

        this.protocolCatalog.clear();
        for (const protocol of this.protocolsFallback) {
          this.protocolCatalog.set(protocol.id, protocol);
        }

        this.rebuildVisibleProtocols();
        this.finishLoading();
      },
    });
  }

  private loadOdontogramFromRoute(): void {
    this.beginLoading();
    this.loadError = null;

    const patientId = Number(this.route.snapshot.queryParamMap.get('patientId'));
    const visitId = Number(this.route.snapshot.queryParamMap.get('visitId'));
    const odontogramId = Number(this.route.snapshot.queryParamMap.get('odontogramId'));

    if (!Number.isFinite(patientId) || patientId < 1 || !Number.isFinite(visitId) || visitId < 1) {
      this.loadError = 'No s\'ha rebut una cita valida per obrir l\'odontograma.';
      this.finishLoading();
      return;
    }

    const loadRequest = Number.isFinite(odontogramId) && odontogramId > 0
      ? this.odontogramService.getOdontogram(odontogramId)
      : this.appointmentService.openAppointment(visitId).pipe(
          switchMap((response: unknown) => {
            const resolvedOdontogramId = this.extractOdontogramIdFromAppointmentOpenResponse(response);

            if (resolvedOdontogramId !== null) {
              return this.odontogramService.getOdontogram(resolvedOdontogramId);
            }

            return this.odontogramService.openOdontogram(patientId, visitId).pipe(
              switchMap(({ odontogram }: OpenOdontogramResponse) =>
                this.odontogramService.getOdontogram(odontogram.id)
              )
            );
          })
        );

    loadRequest.subscribe({
      next: (odontogram: OdontogramApi) => {
        this.applyOdontogramState(odontogram);
        this.finishLoading();
      },
      error: (error: unknown) => {
        console.error('Failed to load the odontogram.', error);
        this.loadError = 'No s\'ha pogut carregar l\'odontograma.';
        this.finishLoading();
      },
    });
  }

  private beginLoading(): void {
    this.pendingLoadCount += 1;
    this.isLoading = true;
  }

  private finishLoading(): void {
    this.pendingLoadCount = Math.max(0, this.pendingLoadCount - 1);
    this.isLoading = this.pendingLoadCount > 0;
  }

  private getProtocolOrder(label: string): number {
    const normalizedLabel = label.trim().toLowerCase();

    switch (normalizedLabel) {
      case 'càries':
      case 'caries':
        return 1;
      case 'endodòncia':
      case 'endodoncia':
        return 2;
      case 'neteja':
        return 3;
      default:
        return 99;
    }
  }

  private applyOdontogramState(odontogram: OdontogramApi): void {
    const nextPatientId = odontogram.patient_id;
    if (this.patientId !== nextPatientId) {
      this.treatments = [];
      this.persistedTreatments = [];
      this.treatmentsError = null;
      this.isTreatmentsLoading = false;
      this.isTreatmentsModalOpen = false;
      this.pendingCreatedTreatments.splice(0, this.pendingCreatedTreatments.length);
      this.pendingTreatmentStatusUpdates.clear();
      this.pendingDeletedTreatmentIds.clear();
    }

    this.odontogramId = odontogram.id;
    this.patientId = nextPatientId;
    this.visitId = odontogram.visit_id;
    this.faceMarkMap.clear();

    for (const detail of odontogram.details) {
      this.applyDetail(detail);
    }

    this.rebuildVisibleProtocols();
  }

  private applyDetail(detail: OdontogramDetailApi): void {
    const pathologyType = detail.pathology?.pathology_type;
    if (!pathologyType?.id || !pathologyType.name) {
      return;
    }

    const protocol = this.mapPathologyTypeToProtocol({
      id: pathologyType.id,
      name: pathologyType.name,
      defaultDuration: 0,
    });

    if (!protocol) {
      return;
    }

    const color = this.normalizeColor(detail.pathology?.protocol_color) ?? protocol.accentColor;
    const pathologyId = detail.pathology?.id ?? null;
    const visualType = detail.pathology?.visual_type ?? null;

    if (!this.protocolCatalog.has(protocol.id)) {
      this.protocolCatalog.set(protocol.id, {
        ...protocol,
        accentColor: color,
      });
    }

    for (const face of detail.faces) {
      const faceName = face.face_name.trim().toUpperCase() as OdontogramFace;
      if (!this.isSupportedFace(faceName)) {
        continue;
      }

      this.faceMarkMap.set(this.getStoredFaceKey(String(detail.tooth_number), faceName, protocol.id), {
        pathologyTypeId: protocol.id,
        pathologyId,
        pathologyLabel: protocol.label,
        color,
        visualType,
      });
    }
  }

  private mapTreatmentItem(raw: unknown): TreatmentItem | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const record = raw as Record<string, unknown>;
    const id = this.toPositiveNumber(record['treatmentId'] ?? record['id']);
    const name = this.toNonEmptyString(record['treatmentName'] ?? record['name']);

    if (id === null || name === null) {
      return null;
    }

    return {
      id,
      name,
      pathologyTypeName: this.toNonEmptyString(record['pathologyTypeName']) ?? 'Sense tipus',
      duration: this.toPositiveNumber(record['duration']),
      status: this.toNonEmptyString(record['status_real'] ?? record['status']),
      description: this.toNonEmptyString(record['description']),
      notes: this.toNonEmptyString(record['schedulingNotes']),
    };
  }

  private toPositiveNumber(value: unknown): number | null {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }

    return parsed;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private reloadTreatments(): void {
    if (!this.patientId) {
      return;
    }

    this.isTreatmentsLoading = true;
    this.treatmentsError = null;

    this.odontogramService.getPatientTreatments(this.patientId).subscribe({
      next: (response: unknown) => {
        const list = Array.isArray(response) ? response : [];
        this.persistedTreatments = list
          .map((item) => this.mapTreatmentItem(item))
          .filter((item): item is TreatmentItem => item !== null);
        this.rebuildTreatmentsList();
        this.isTreatmentsLoading = false;
      },
      error: (error: unknown) => {
        console.error('Failed to reload patient treatments for odontogram.', error);
        this.persistedTreatments = [];
        this.rebuildTreatmentsList();
        this.treatmentsError = 'No s\'han pogut carregar els tractaments del pacient.';
        this.isTreatmentsLoading = false;
      },
    });
  }

  private getLinkedPathologyIds(): number[] {
    return Array.from(
      new Set(
        Array.from(this.faceMarkMap.values())
          .map((mark) => mark.pathologyId)
          .filter((pathologyId): pathologyId is number => pathologyId !== null && pathologyId > 0)
      )
    );
  }

  private createEmptyTreatmentDraft(): TreatmentDraft {
    return {
      name: '',
      description: '',
      duration: 30,
      status: 'Actiu',
      notes: '',
    };
  }

  private rebuildTreatmentsList(): void {
    const mergedPersistedTreatments = this.persistedTreatments.map((treatment) => ({
      ...treatment,
      status: this.pendingTreatmentStatusUpdates.get(treatment.id) ?? treatment.status,
      isPending: this.pendingTreatmentStatusUpdates.has(treatment.id),
    }))
      .filter((treatment) => !this.pendingDeletedTreatmentIds.has(treatment.id));

    this.treatments = [...mergedPersistedTreatments, ...this.pendingCreatedTreatments];
  }

  private getPendingTreatmentPathologyLabel(): string {
    const protocol = this.getSelectedProtocol();
    return protocol?.label ?? 'Sense tipus';
  }

  private persistPendingTreatmentChanges() {
    if (!this.visitId) {
      return of(void 0);
    }

    const createRequests = this.pendingCreatedTreatments.map((treatment) => ({
      treatmentName: treatment.name,
      description: treatment.description ?? 'Creat des de l\'odontograma',
      estimatedDuration: treatment.duration ?? 30,
      status: treatment.status ?? 'Actiu',
      schedulingNotes: treatment.notes ?? null,
      pathology_ids: this.getLinkedPathologyIds(),
      appointment_id: this.visitId!,
    }));

    const statusUpdateRequests = Array.from(this.pendingTreatmentStatusUpdates.entries()).map(([id, status]) => ({
      id,
      status,
    }))
      .filter(({ id }) => !this.pendingDeletedTreatmentIds.has(id));

    const deleteRequests = Array.from(this.pendingDeletedTreatmentIds.values());

    return from(createRequests).pipe(
      concatMap((payload) => this.odontogramService.createTreatment(payload)),
      toArray(),
      switchMap(() =>
        from(statusUpdateRequests).pipe(
          concatMap(({ id, status }) => this.odontogramService.updateTreatment(id, { status })),
          toArray(),
          switchMap(() =>
            from(deleteRequests).pipe(
              concatMap((id) => this.odontogramService.deleteTreatment(id)),
              toArray(),
              map(() => void 0)
            )
          )
        )
      ),
      switchMap(() => {
        this.pendingCreatedTreatments.splice(0, this.pendingCreatedTreatments.length);
        this.pendingTreatmentStatusUpdates.clear();
        this.pendingDeletedTreatmentIds.clear();
        return of(void 0);
      })
    );
  }

  private buildSyncEntries(): SyncOdontogramEntry[] {
    const groupedEntries = new Map<string, SyncOdontogramEntry>();
    const faceOrder: Record<OdontogramFace, number> = { M: 0, O: 1, D: 2, V: 3, L: 4 };

    for (const [faceKey, mark] of this.faceMarkMap.entries()) {
      const [toothNumber, faceName, pathologyTypeId] = faceKey.split(':') as [string, OdontogramFace, string];
      const entryKey = [
        toothNumber,
        pathologyTypeId,
        mark.pathologyId ?? 'new',
        mark.color,
        mark.visualType ?? '',
      ].join(':');

      const existingEntry = groupedEntries.get(entryKey);
      if (existingEntry) {
        if (!existingEntry.faces.includes(faceName)) {
          existingEntry.faces.push(faceName);
        }
        continue;
      }

      groupedEntries.set(entryKey, {
        tooth_number: Number(toothNumber),
        pathology_type_id: Number(pathologyTypeId),
        pathology_id: mark.pathologyId,
        protocol_color: mark.color,
        visual_type: mark.visualType,
        faces: [faceName],
      });
    }

    return Array.from(groupedEntries.values()).map((entry) => ({
      ...entry,
      faces: [...entry.faces].sort((left, right) => faceOrder[left as OdontogramFace] - faceOrder[right as OdontogramFace]),
    }));
  }

  private rebuildVisibleProtocols(): void {
    const protocolsById = new Map<number, ProtocolItem>();

    for (const protocolId of this.manuallyAddedProtocolIds) {
      const protocol = this.getProtocolById(protocolId);
      if (protocol) {
        protocolsById.set(protocol.id, protocol);
      }
    }

    for (const mark of this.faceMarkMap.values()) {
      if (protocolsById.has(mark.pathologyTypeId)) {
        continue;
      }

      const knownProtocol = this.getProtocolById(mark.pathologyTypeId);
      protocolsById.set(mark.pathologyTypeId, {
        id: mark.pathologyTypeId,
        label: knownProtocol?.label ?? mark.pathologyLabel,
        accentColor: mark.color,
      });
    }

    if (this.selectedProtocolId !== null && !protocolsById.has(this.selectedProtocolId)) {
      const selectedProtocol = this.getProtocolById(this.selectedProtocolId);
      if (selectedProtocol) {
        protocolsById.set(selectedProtocol.id, selectedProtocol);
      }
    }

    this.protocols = Array.from(protocolsById.values()).sort(
      (left, right) => this.getProtocolOrder(left.label) - this.getProtocolOrder(right.label)
    );

    if (this.selectedProtocolId && !protocolsById.has(this.selectedProtocolId)) {
      this.selectedProtocolId = null;
      this.isEraseMode = false;
      this.clearBatchSelection();
      this.isBatchSelectionMode = false;
    }

    if (this.selectedProtocolId === null && this.protocols.length > 0) {
      this.selectedProtocolId = this.protocols[0].id;
    }
  }

  private createTeeth(labels: string[]): ToothItem[] {
    return labels.map((label) => ({
      id: label,
      label,
    }));
  }

  private getStoredFaceKey(toothId: string, face: OdontogramFace, pathologyTypeId: number): string {
    return `${toothId}:${face}:${pathologyTypeId}`;
  }

  private getSelectionKey(toothId: string, face: OdontogramFace): string {
    return `${toothId}:${face}`;
  }

  private applyFaceChange(toothId: string, face: OdontogramFace): void {
    if (!this.selectedProtocolId) {
      return;
    }

    const faceKey = this.getStoredFaceKey(toothId, face, this.selectedProtocolId);

    if (this.isEraseMode) {
      this.faceMarkMap.delete(faceKey);
      this.rebuildVisibleProtocols();
      return;
    }

    const protocol = this.getProtocolById(this.selectedProtocolId);
    const colorMode = this.getSelectedColorMode();
    if (!protocol || !colorMode) {
      return;
    }

    const existingMark = this.faceMarkMap.get(faceKey);
    if (existingMark && existingMark.color === colorMode.color) {
      return;
    }

    this.faceMarkMap.set(faceKey, {
      pathologyTypeId: protocol.id,
      pathologyId: existingMark?.color === colorMode.color ? existingMark.pathologyId : null,
      pathologyLabel: protocol.label,
      color: colorMode.color,
      visualType: colorMode.visualType,
    });

    this.rebuildVisibleProtocols();
  }

  private getProtocolById(protocolId: number): ProtocolItem | null {
    return this.protocolCatalog.get(protocolId) ?? this.protocols.find((protocol) => protocol.id === protocolId) ?? null;
  }

  private isSupportedFace(face: string): face is OdontogramFace {
    return face === 'M' || face === 'O' || face === 'D' || face === 'V' || face === 'L';
  }

  private mapPathologyTypeToProtocol(pathologyType: PathologyTypeItem): ProtocolItem | null {
    const normalizedName = pathologyType.name.trim().toLowerCase();

    if (normalizedName === 'càries' || normalizedName === 'caries') {
      return {
        id: pathologyType.id,
        label: pathologyType.name,
        accentColor: '#FF0000',
      };
    }

    if (normalizedName === 'neteja') {
      return {
        id: pathologyType.id,
        label: pathologyType.name,
        accentColor: '#62D5E2',
      };
    }

    if (normalizedName === 'endodòncia' || normalizedName === 'endodoncia') {
      return {
        id: pathologyType.id,
        label: pathologyType.name,
        accentColor: '#9B8CFF',
      };
    }

    return {
      id: pathologyType.id,
      label: pathologyType.name,
      accentColor: '#9AA7B2',
    };
  }

  private normalizeColor(color: string | null | undefined): string | null {
    if (typeof color !== 'string') {
      return null;
    }

    const normalizedColor = color.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalizedColor) ? normalizedColor : null;
  }

  private extractOdontogramIdFromAppointmentOpenResponse(response: unknown): number | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const payload = response as Record<string, unknown>;
    const appointment = payload['appointment'];

    return this.toPositiveNumberOrNull(payload['odontogramId'])
      ?? this.toPositiveNumberOrNull(
        appointment && typeof appointment === 'object'
          ? (appointment as Record<string, unknown>)['odontogramId']
          : null
      );
  }

  private toPositiveNumberOrNull(value: unknown): number | null {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }
}
