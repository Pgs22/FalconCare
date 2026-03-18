import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink],
  template: `
    <main style="padding: 16px;">
      <h2>Dashboard</h2>
      <nav style="display:flex; gap: 12px; margin-top: 12px;">
        <a routerLink="/patients">Pacientes</a>
        <a routerLink="/documents">Documentos</a>
      </nav>
    </main>
  `,
})
export class DashboardPageComponent {}

