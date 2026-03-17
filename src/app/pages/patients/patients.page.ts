import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-patients-page',
  imports: [CommonModule],
  template: `
    <main style="padding: 16px;">
      <h2>Pacientes</h2>
      <p>Vista mínima para comprobar conexión con Symfony.</p>
    </main>
  `,
})
export class PatientsPageComponent {}

