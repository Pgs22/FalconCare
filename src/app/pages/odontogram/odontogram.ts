import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  OdontogramFace,
  OdontogramFaceStatus,
  OdontogramToothComponent,
  OdontogramToothState,
} from '../../shared/odontogram-tooth/odontogram-tooth';
import { PathologyTypeItem, PathologyTypeService } from '../../services/pathology-type.service';
import {
  OdontogramApi,
  OdontogramDetailApi,
  OdontogramService,
  OpenOdontogramResponse,
  SyncOdontogramEntry,
  SyncOdontogramResponse,
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
  id: number | null;
  key: ToothStatus | 'erase';
  label: string;
};

@Component({
  selector: 'app-odontogram',
  standalone: true,
  imports: [CommonModule, OdontogramToothComponent],
  templateUrl: './odontogram.html',
  styleUrl: './odontogram.css',
})
export class OdontogramComponent implements OnInit {
  private readonly pathologyTypeService = inject(PathologyTypeService);
  private readonly odontogramService = inject(OdontogramService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isLoading = true;
  isSaving = false;
  loadError: string | null = null;
  saveFeedback: string | null = null;
  odontogramId: number | null = null;
  patientId: number | null = null;
  visitId: number | null = null;

  readonly protocolsFallback: ProtocolItem[] = [
    { id: 1, key: 'caries', label: 'Càries' },
    { id: 3, key: 'endodoncia', label: 'Endodòncia' },
    { id: 2, key: 'neteja', label: 'Neteja' },
  ];

  protocols: ProtocolItem[] = this.protocolsFallback;
  readonly eraseProtocol: ProtocolItem = {
    id: null,
    key: 'erase',
    label: 'Esborrar marca',
  };

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
  selectedProtocol: ProtocolItem | null = null;
  private readonly faceStatusMap = new Map<string, ToothStatus>();

  ngOnInit(): void {
    this.loadPathologyTypes();
    this.loadOdontogramFromRoute();
  }

  selectTooth(tooth: ToothItem): void {
    this.selectedTooth = tooth;
  }

  selectProtocol(protocol: ProtocolItem): void {
    this.selectedProtocol = protocol;
    this.saveFeedback = null;
  }

  toggleFace(tooth: ToothItem, face: OdontogramFace, event?: Event): void {
    event?.stopPropagation();
    this.selectedTooth = tooth;
    this.saveFeedback = null;

    const key = this.getFaceKey(tooth.id, face);

    if (!this.selectedProtocol) {
      return;
    }

    if (this.selectedProtocol.key === 'erase') {
      this.faceStatusMap.delete(key);
      return;
    }

    if (this.faceStatusMap.get(key) === this.selectedProtocol.key) {
      return;
    }

    this.faceStatusMap.set(key, this.selectedProtocol.key);
  }

  onCloseOdontogram(): void {
    if (!this.odontogramId || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.saveFeedback = null;

    this.odontogramService.syncDetails(this.odontogramId, this.buildSyncEntries()).subscribe({
      next: async ({ odontogram }: SyncOdontogramResponse) => {
        this.applyOdontogramState(odontogram);
        this.isSaving = false;
        await this.router.navigate(['/appointments']);
      },
      error: (error: unknown) => {
        console.error('Failed to synchronize the odontogram.', error);
        this.isSaving = false;
        this.saveFeedback = 'No s\'ha pogut guardar l\'odontograma.';
      },
    });
  }

  getFaceStatus(tooth: ToothItem, face: OdontogramFace): ToothStatus | null {
    return this.faceStatusMap.get(this.getFaceKey(tooth.id, face)) ?? null;
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

  trackByTooth(_index: number, tooth: ToothItem): string {
    return tooth.id;
  }

  trackByQuadrant(_index: number, quadrant: Quadrant): string {
    return quadrant.id;
  }

  trackByProtocol(_index: number, protocol: ProtocolItem): string {
    return protocol.key;
  }

  private loadPathologyTypes(): void {
    this.pathologyTypeService.list().subscribe({
      next: (pathologyTypes) => {
        const mappedProtocols = pathologyTypes
          .map((pathologyType) => this.mapPathologyTypeToProtocol(pathologyType))
          .filter((protocol): protocol is ProtocolItem => protocol !== null)
          .sort((left, right) => this.getProtocolOrder(left.key) - this.getProtocolOrder(right.key));

        if (mappedProtocols.length > 0) {
          this.protocols = mappedProtocols;
        }
      },
      error: (error) => {
        console.error('Failed to load pathology types for odontogram protocol.', error);
      },
    });
  }

  private loadOdontogramFromRoute(): void {
    this.isLoading = true;
    this.loadError = null;

    const patientId = Number(this.route.snapshot.queryParamMap.get('patientId'));
    const visitId = Number(this.route.snapshot.queryParamMap.get('visitId'));

    if (!Number.isFinite(patientId) || patientId < 1 || !Number.isFinite(visitId) || visitId < 1) {
      this.isLoading = false;
      this.loadError = 'No s\'ha rebut una cita valida per obrir l\'odontograma.';
      return;
    }

    this.odontogramService.openOdontogram(patientId, visitId).subscribe({
      next: ({ odontogram }: OpenOdontogramResponse) => {
        this.applyOdontogramState(odontogram);
        this.isLoading = false;
      },
      error: (error: unknown) => {
        console.error('Failed to open the fixed odontogram.', error);
        this.isLoading = false;
        this.loadError = 'No s\'ha pogut carregar l\'odontograma.';
      },
    });
  }

  private getProtocolOrder(key: ProtocolItem['key']): number {
    switch (key) {
      case 'erase':
        return 0;
      case 'caries':
        return 1;
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
    this.faceStatusMap.clear();

    for (const detail of odontogram.details) {
      const protocol = this.mapDetailToProtocol(detail);
      if (!protocol) {
        continue;
      }

      for (const face of detail.faces) {
        const faceName = face.face_name.trim().toUpperCase() as OdontogramFace;
        if (!this.isSupportedFace(faceName)) {
          continue;
        }

        if (protocol.key === 'erase') {
          continue;
        }

        this.faceStatusMap.set(this.getFaceKey(String(detail.tooth_number), faceName), protocol.key);
      }
    }
  }

  private buildSyncEntries(): SyncOdontogramEntry[] {
    const groupedEntries = new Map<string, SyncOdontogramEntry>();
    const faceOrder: Record<OdontogramFace, number> = { M: 0, O: 1, D: 2, V: 3, L: 4 };

    for (const [faceKey, status] of this.faceStatusMap.entries()) {
      const protocol = this.protocols.find((candidate) => candidate.key === status);
      if (!protocol?.id) {
        continue;
      }

      const [toothNumber, faceName] = faceKey.split(':') as [string, OdontogramFace];
      const entryKey = `${toothNumber}:${protocol.id}`;
      const existingEntry = groupedEntries.get(entryKey);

      if (existingEntry) {
        if (!existingEntry.faces.includes(faceName)) {
          existingEntry.faces.push(faceName);
        }
        continue;
      }

      groupedEntries.set(entryKey, {
        tooth_number: Number(toothNumber),
        pathology_type_id: protocol.id,
        faces: [faceName],
      });
    }

    return Array.from(groupedEntries.values()).map((entry) => ({
      ...entry,
      faces: [...entry.faces].sort((left, right) => faceOrder[left as OdontogramFace] - faceOrder[right as OdontogramFace]),
    }));
  }

  private mapDetailToProtocol(detail: OdontogramDetailApi): ProtocolItem | null {
    const pathologyType = detail.pathology?.pathology_type;
    if (!pathologyType?.name) {
      return null;
    }

    return this.mapPathologyTypeToProtocol({
      id: pathologyType.id ?? 0,
      name: pathologyType.name,
      defaultDuration: 0,
    });
  }

  private createTeeth(labels: string[]): ToothItem[] {
    return labels.map((label) => ({
      id: label,
      label,
    }));
  }

  private getFaceKey(toothId: string, face: OdontogramFace): string {
    return `${toothId}:${face}`;
  }

  private isSupportedFace(face: string): face is OdontogramFace {
    return face === 'M' || face === 'O' || face === 'D' || face === 'V' || face === 'L';
  }

  private mapPathologyTypeToProtocol(pathologyType: PathologyTypeItem): ProtocolItem | null {
    const normalizedName = pathologyType.name.trim().toLowerCase();

    if (normalizedName === 'càries' || normalizedName === 'caries') {
      return {
        id: pathologyType.id,
        key: 'caries',
        label: pathologyType.name,
      };
    }

    if (normalizedName === 'neteja') {
      return {
        id: pathologyType.id,
        key: 'neteja',
        label: pathologyType.name,
      };
    }

    if (normalizedName === 'endodòncia' || normalizedName === 'endodoncia') {
      return {
        id: pathologyType.id,
        key: 'endodoncia',
        label: pathologyType.name,
      };
    }

    return null;
  }
}
