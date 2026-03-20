import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { LoginComponent } from './pages/login/login';
import { PatientRegisterComponent } from './pages/patient-register/patient-register';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { PatientsPageComponent } from './pages/patients/patients.page';
import { DocumentsPageComponent } from './pages/documents/documents.page';
import { NotFoundPageComponent } from './pages/not-found/not-found.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: LoginComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: PatientRegisterComponent },
  { path: 'registro', redirectTo: 'register', pathMatch: 'full' },

  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: 'patients', component: PatientsPageComponent, canActivate: [authGuard] },
  { path: 'documents', component: DocumentsPageComponent, canActivate: [authGuard] },

  { path: '**', component: NotFoundPageComponent },
];
