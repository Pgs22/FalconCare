import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/** Navbar superior compartida. Editar solo aquí para /documents y /appointments. */
@Component({
  selector: 'app-clinic-topbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './clinic-topbar.html',
  styleUrl: './clinic-topbar.css',
})
export class ClinicTopbarComponent {}
