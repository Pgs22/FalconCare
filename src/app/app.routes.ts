import { Routes } from '@angular/router';

import { authGuard, clinicalRoleGuard, guestOnlyGuard } from './guards/auth.guard';
import { LoginComponent } from './pages/login/login';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: LoginComponent, canActivate: [guestOnlyGuard] },
  { path: 'login', component: LoginComponent, canActivate: [guestOnlyGuard] },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/doctor-register/doctor-register').then((m) => m.DoctorRegisterComponent),
    canActivate: [guestOnlyGuard],
  },
  {
    path: 'doctor-register',
    loadComponent: () =>
      import('./pages/doctor-register/doctor-register').then((m) => m.DoctorRegisterComponent),
    canActivate: [guestOnlyGuard],
  },
  { path: 'registro', redirectTo: 'doctor-register', pathMatch: 'full' },
  {
    path: 'patient-register',
    loadComponent: () =>
      import('./pages/patient-register/patient-register').then((m) => m.PatientRegisterComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'doctor-panel',
    loadComponent: () =>
      import('./pages/doctor-panel/doctor-panel').then((m) => m.DoctorPanelComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'patient-panel/:patientId',
    loadComponent: () =>
      import('./pages/patient-panel/patient-panel').then((m) => m.PatientPanelComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'patients',
    loadComponent: () =>
      import('./pages/patients/patients.page').then((m) => m.PatientsPageComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'appointments',
    loadComponent: () =>
      import('./pages/appointment/appointment.page').then((m) => m.AppointmentPageComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'odontogram',
    loadComponent: () =>
      import('./pages/odontogram/odontogram.page').then((m) => m.OdontogramPageComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./pages/documents/documents.page').then((m) => m.DocumentsPageComponent),
    canActivate: [clinicalRoleGuard],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.page').then((m) => m.NotFoundPageComponent),
  },
];
