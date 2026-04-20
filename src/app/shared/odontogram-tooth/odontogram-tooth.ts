import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type OdontogramFace = 'M' | 'O' | 'D' | 'V' | 'L';
export type OdontogramFaceStatus = 'caries' | 'neteja' | 'endodoncia';
export type OdontogramToothState = Partial<Record<OdontogramFace, OdontogramFaceStatus | null>>;

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

  readonly faces: OdontogramFace[] = ['M', 'O', 'D', 'V', 'L'];

  onToothClick(): void {
    this.toothClick.emit(this.toothNumber);
  }

  onFaceClick(face: OdontogramFace, event: Event): void {
    event.stopPropagation();
    this.faceToggle.emit(face);
  }

  getFaceClass(face: OdontogramFace): string[] {
    const classes = [`odontogram-tooth__zone--${face}`];
    const status = this.state[face];

    if (status) {
      classes.push(`odontogram-tooth__zone--${status}`);
    }

    return classes;
  }
}
