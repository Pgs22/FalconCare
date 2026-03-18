import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-documents-page',
  imports: [CommonModule],
  template: `
    <main style="padding: 16px;">
      <h2>Documentos</h2>
      <p>Vista mínima para comprobar conexión con Symfony y subida/descarga.</p>
    </main>
  `,
})
export class DocumentsPageComponent {}

