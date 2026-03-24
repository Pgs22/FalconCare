import { Component } from '@angular/core';
import { AppointmentComponent } from './appointment';

@Component({
  standalone: true,
  selector: 'app-appointment-page',
  imports: [AppointmentComponent],
  template: `
    <app-appointment></app-appointment>
  `,
})
export class AppointmentPageComponent {}