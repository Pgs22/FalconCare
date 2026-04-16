import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-not-found-page',
  imports: [CommonModule, RouterLink],
  template: `
    <main style="padding: 16px;">
      <h2>404</h2>
      <p>Página no encontrada.</p>
      <a routerLink="/doctor-panel">Volver al panel</a>
    </main>
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
export class NotFoundPageComponent {}

