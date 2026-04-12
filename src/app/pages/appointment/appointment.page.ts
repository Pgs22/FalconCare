import { Component } from '@angular/core';
import { AppointmentComponent } from './appointment';

/**
 * Vista de agenda / citas (`/appointments`).
 * Cuando exista el flujo completo, leer `ActivatedRoute.queryParams` (`patientId`, `firstVisit`)
 * enviados desde el patient-panel para preseleccionar paciente y tipo de alta.
 */
@Component({
  standalone: true,
  selector: 'app-appointment-page',
  imports: [AppointmentComponent],
  template: `
    <app-appointment></app-appointment>
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
export class AppointmentPageComponent {}