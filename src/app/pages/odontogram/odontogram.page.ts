import { Component } from '@angular/core';
import { OdontogramComponent } from './odontogram';

@Component({
  standalone: true,
  selector: 'app-odontogram-page',
  imports: [OdontogramComponent],
  template: `
    <app-odontogram></app-odontogram>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }
    `,
  ],
})
export class OdontogramPageComponent {}
