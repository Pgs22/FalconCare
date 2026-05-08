import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type OdontogramFace = 'M' | 'O' | 'D' | 'V' | 'L';
export type OdontogramFaceStatus = string;
export type OdontogramToothState = Partial<Record<OdontogramFace, OdontogramFaceStatus | null>>;
export type OdontogramFaceInteraction = {
  face: OdontogramFace;
  phase: 'start' | 'enter';
};

@Component({
  selector: 'app-odontogram-tooth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './odontogram-tooth.html',
  styleUrl: './odontogram-tooth.css',
})
export class OdontogramToothComponent {
  @Input({ required: true }) toothNumber = '';
  @Input() state: OdontogramToothState = {};
  @Input() compact = false;
  @Input() selected = false;

  @Output() toothClick = new EventEmitter<string>();
  @Output() faceToggle = new EventEmitter<OdontogramFace>();
  @Output() faceInteraction = new EventEmitter<OdontogramFaceInteraction>();

  readonly faces: OdontogramFace[] = ['M', 'O', 'D', 'V', 'L'];

  onToothClick(): void {
    this.toothClick.emit(this.toothNumber);
  }

  onFaceClick(face: OdontogramFace, event: Event): void {
    event.stopPropagation();
    this.faceToggle.emit(face);
  }

  onFacePointerDown(face: OdontogramFace, event: PointerEvent): void {
    event.stopPropagation();
    this.faceInteraction.emit({ face, phase: 'start' });
  }

  onFacePointerEnter(face: OdontogramFace, event: PointerEvent): void {
    event.stopPropagation();
    this.faceInteraction.emit({ face, phase: 'enter' });
  }

  getFaceStyle(face: OdontogramFace): Record<string, string> {
    const color = this.state[face];
    const style: Record<string, string> = {};

    if (color) {
      style['--odontogram-face-fill'] = color;
      style['--odontogram-face-stroke'] = color;
      style['--odontogram-face-hover'] = color;
    }

    return style;
  }
}
