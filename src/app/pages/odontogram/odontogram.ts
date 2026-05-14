import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { switchMap } from 'rxjs';
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
  titleKey: string;
  permanent: ToothItem[];
  temporary: ToothItem[];
  side: 'left' | 'right';
};

type ProtocolItem = {
  id: number;
  label: string;
  labelKey?: string;
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
  labelKey: string;
  color: string;
  visualType: string;
};

@Component({
  selector: 'app-odontogram',
  standalone: true,
  imports: [CommonModule, OdontogramToothComponent, TranslateModule],
  templateUrl: './odontogram.html',
  styleUrl: './odontogram.css',
})
export class OdontogramComponent implements OnInit {
  private readonly appointmentService = inject(AppointmentService);
  private readonly pathologyTypeService = inject(PathologyTypeService);
  private readonly odontogramService = inject(OdontogramService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
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
  loadError: string | null = null;
  saveFeedback: string | null = null;
  odontogramId: number | null = null;
  patientId: number | null = null;
  visitId: number | null = null;
  selectedProtocolId: number | null = null;
  selectedColorModeId: ColorMode['id'] = 'pending';

  readonly protocolsFallback: ProtocolItem[] = [
    { id: 1, label: 'Caries', labelKey: 'odontogram.protocolTypes.caries', accentColor: '#FF0000' },
    { id: 3, label: 'Endodoncia', labelKey: 'odontogram.protocolTypes.endodontics', accentColor: '#9B8CFF' },
    { id: 2, label: 'Limpieza', labelKey: 'odontogram.protocolTypes.cleaning', accentColor: '#62D5E2' },
  ];

  protocols: ProtocolItem[] = [];

  readonly colorModes: ColorMode[] = [
    { id: 'pending', labelKey: 'odontogram.colorModes.pending', color: '#FF0000', visualType: 'Pendent' },
    { id: 'done', labelKey: 'odontogram.colorModes.done', color: '#6EC6E8', visualType: 'Fet' },
  ];

  readonly topQuadrants: Quadrant[] = [
    {
      id: 'q1',
      titleKey: 'odontogram.quadrants.q1',
      side: 'left',
      permanent: this.createTeeth(['18', '17', '16', '15', '14', '13', '12', '11']),
      temporary: this.createTeeth(['55', '54', '53', '52', '51']),
    },
    {
      id: 'q2',
      titleKey: 'odontogram.quadrants.q2',
      side: 'right',
      permanent: this.createTeeth(['21', '22', '23', '24', '25', '26', '27', '28']),
      temporary: this.createTeeth(['61', '62', '63', '64', '65']),
    },
  ];

  readonly bottomQuadrants: Quadrant[] = [
    {
      id: 'q4',
      titleKey: 'odontogram.quadrants.q4',
      side: 'left',
      permanent: this.createTeeth(['48', '47', '46', '45', '44', '43', '42', '41']),
      temporary: this.createTeeth(['85', '84', '83', '82', '81']),
    },
    {
      id: 'q3',
      titleKey: 'odontogram.quadrants.q3',
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

    this.odontogramService
      .syncDetails(this.odontogramId, this.buildSyncEntries())
      .pipe(
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
          this.saveFeedback = this.translate.instant('odontogram.errors.saveFailed');
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

    if (!Number.isFinite(patientId) || patientId < 1 || !Number.isFinite(visitId) || visitId < 1) {
      this.loadError = this.translate.instant('odontogram.errors.invalidAppointment');
      this.finishLoading();
      return;
    }

    this.odontogramService.openOdontogram(patientId, visitId).subscribe({
      next: ({ odontogram }: OpenOdontogramResponse) => {
        this.applyOdontogramState(odontogram);
        this.finishLoading();
      },
      error: (error: unknown) => {
        console.error('Failed to open the fixed odontogram.', error);
        this.loadError = this.translate.instant('odontogram.errors.loadFailed');
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
    this.odontogramId = odontogram.id;
    this.patientId = odontogram.patient_id;
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
}
