import { Routes } from '@angular/router';

import { authGuard, clinicalRoleGuard, guestOnlyGuard } from './guards/auth.guard';
import { environment } from '../environments/environment';
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
  { path: 'patient-register', component: PatientRegisterComponent, canActivate: [clinicalRoleGuard] },
  { path: 'doctor-panel', component: DoctorPanelComponent, canActivate: [clinicalRoleGuard] },
  { path: 'patient-panel/:patientId', component: PatientPanelComponent, canActivate: [clinicalRoleGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },

  { path: 'dashboard', component: DashboardPageComponent, canActivate: [clinicalRoleGuard] },
  { path: 'patients', component: PatientsPageComponent, canActivate: [clinicalRoleGuard] },

  { path: 'appointments', component: AppointmentPageComponent, canActivate: [clinicalRoleGuard] },
  { path: 'odontogram', component: OdontogramPageComponent, canActivate: [clinicalRoleGuard] },
  { path: 'documents', component: DocumentsPageComponent, canActivate: [clinicalRoleGuard] },

  { path: '**', component: NotFoundPageComponent },
];
