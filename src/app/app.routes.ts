import { Routes } from '@angular/router';

import { authGuard, guestOnlyGuard } from './guards/auth.guard';
import { LoginComponent } from './pages/login/login';
import { PatientRegisterComponent } from './pages/patient-register/patient-register';
import { DoctorRegisterComponent } from './pages/doctor-register/doctor-register';
import { DoctorPanelComponent } from './pages/doctor-panel/doctor-panel';
import { PatientPanelComponent } from './pages/patient-panel/patient-panel';
import { SettingsComponent } from './pages/settings/settings';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { PatientsPageComponent } from './pages/patients/patients.page';
import { AppointmentPageComponent } from './pages/appointment/appointment.page';
import { DocumentsPageComponent } from './pages/documents/documents.page';
import { NotFoundPageComponent } from './pages/not-found/not-found.page';
import { OdontogramPageComponent } from './pages/odontogram/odontogram.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: LoginComponent, canActivate: [guestOnlyGuard] },
  { path: 'login', component: LoginComponent, canActivate: [guestOnlyGuard] },
  { path: 'register', component: DoctorRegisterComponent, canActivate: [guestOnlyGuard] },
  { path: 'doctor-register', component: DoctorRegisterComponent, canActivate: [guestOnlyGuard] },
  { path: 'registro', redirectTo: 'doctor-register', pathMatch: 'full' },
  { path: 'patient-register', component: PatientRegisterComponent, canActivate: [authGuard] },
  { path: 'doctor-panel', component: DoctorPanelComponent, canActivate: [authGuard] },
  { path: 'patient-panel/:patientId', component: PatientPanelComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },

  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: 'patients', component: PatientsPageComponent, canActivate: [authGuard] },

  { path: 'appointments', component: AppointmentPageComponent, canActivate: [authGuard] },
  { path: 'odontogram', component: OdontogramPageComponent, canActivate: [authGuard] },
  { path: 'documents', component: DocumentsPageComponent, canActivate: [authGuard] },

  { path: '**', component: NotFoundPageComponent },
];
