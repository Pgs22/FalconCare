import { Component } from '@angular/core';
import { ClinicPageShellComponent } from '../../shared/clinic-layout';
import { AppointmentComponent } from './appointment';

/**
 * Vista de agenda / citas (`/appointments`).
 * Cuando exista el flujo completo, leer `ActivatedRoute.queryParams` (`patientId`, `firstVisit`)
 * enviados desde el patient-panel para preseleccionar paciente y tipo de alta.
 */
@Component({
  standalone: true,
  selector: 'app-appointment-page',
  imports: [ClinicPageShellComponent, AppointmentComponent],
  template: `
    <app-clinic-page-shell>
      <app-appointment />
    </app-clinic-page-shell>
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
