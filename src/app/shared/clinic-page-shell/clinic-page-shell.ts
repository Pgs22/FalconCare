import { Component } from '@angular/core';
import { ClinicTopbarComponent } from '../clinic-topbar/clinic-topbar';

/**
 * Shell clínico compartido: mismo contenedor y topbar que /documents.
 * Cualquier cambio en la navbar debe hacerse en ClinicTopbarComponent.
 */
@Component({
  selector: 'app-clinic-page-shell',
  standalone: true,
  imports: [ClinicTopbarComponent],
  templateUrl: './clinic-page-shell.html',
  styleUrl: './clinic-page-shell.css',
})
export class ClinicPageShellComponent {}
