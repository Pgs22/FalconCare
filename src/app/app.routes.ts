import { Routes } from '@angular/router';

import { authGuard, guestOnlyGuard } from './guards/auth.guard';
import { LoginComponent } from './pages/login/login';
import { PatientRegisterComponent } from './pages/patient-register/patient-register';
import { DoctorPanelComponent } from './pages/doctor-panel/doctor-panel';
import { SettingsComponent } from './pages/settings/settings';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { PatientsPageComponent } from './pages/patients/patients.page';
import { DocumentsPageComponent } from './pages/documents/documents.page';
import { NotFoundPageComponent } from './pages/not-found/not-found.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: LoginComponent, canActivate: [guestOnlyGuard] },
  { path: 'login', component: LoginComponent, canActivate: [guestOnlyGuard] },
  { path: 'register', component: PatientRegisterComponent },
  { path: 'registro', redirectTo: 'register', pathMatch: 'full' },
  { path: 'doctor-panel', component: DoctorPanelComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },

  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: 'patients', component: PatientsPageComponent, canActivate: [authGuard] },
  { path: 'documents', component: DocumentsPageComponent, canActivate: [authGuard] },

  { path: '**', component: NotFoundPageComponent },
];
