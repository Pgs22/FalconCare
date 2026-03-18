import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { LoginPageComponent } from './pages/login/login.page';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { PatientsPageComponent } from './pages/patients/patients.page';
import { DocumentsPageComponent } from './pages/documents/documents.page';
import { NotFoundPageComponent } from './pages/not-found/not-found.page';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent },

  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: 'patients', component: PatientsPageComponent, canActivate: [authGuard] },
  { path: 'documents', component: DocumentsPageComponent, canActivate: [authGuard] },

  { path: '**', component: NotFoundPageComponent },
];
