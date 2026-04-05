import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { AppointmentService, Appointment } from '../../services/appointment.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './appointment.html',
  styleUrl: './appointment.css',
})
export class AppointmentComponent implements OnInit {
  today = new Date();
  appointments = signal<Appointment[]>([]);
  patientsList = signal<any[]>([]);
  doctorsList = signal<any[]>([]);
  boxesList = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  showForm = signal(false);

  isNewPatientMode = false;

  // Data model for the new appointment form
  newAppointmentData = {
    patient: '',
    newPatientName: '',
    newPatientDni: '',
    doctor: '',
    box: '',
    visitDate: '',
    visitTime: '',
    treatment: '',
    consultationReason: '',
    durationMinutes: 30, // Valor per defecte inicial
    isFirstVisit: false,
    isUrgency: false
  };

  constructor(private readonly appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.fetchAppointments();
    this.loadPatients();
  }

  // Alterna entre cercar pacient o crear-ne un de nou
  toggleNewPatientMode(): void {
    this.isNewPatientMode = !this.isNewPatientMode;
    
    if (this.isNewPatientMode) {
      this.newAppointmentData.patient = '';
      this.newAppointmentData.isFirstVisit = true;
      this.onFirstVisitChange(); // Apliquem suggeriments automàtics
    } else {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30;
    }
  }

  // Lògica de suggeriment per a Primera Visita
  onFirstVisitChange(): void {
    if (this.newAppointmentData.isFirstVisit) {
      this.newAppointmentData.isUrgency = false;
      this.newAppointmentData.durationMinutes = 60; // Suggerim més temps
      this.newAppointmentData.consultationReason = 'Primera Visita / Revisió';
    }
  }

  // Lògica de suggeriment per a Urgència
  onUrgencyChange(): void {
    if (this.newAppointmentData.isUrgency) {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30; // Suggerim temps d'urgència
      this.newAppointmentData.consultationReason = 'Urgència';
    }
  }

  fetchAppointments(): void {
    this.error.set(null);
    this.loading.set(true);
    this.appointmentService.getAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No s’ha pogut connectar amb el servidor.');
        this.loading.set(false);
      }
    });
  }

  loadPatients(): void {
    this.appointmentService.getPatients().subscribe({
      next: (data) => {
        console.log('Pacients rebuts:', data);
        this.patientsList.set(data);
      },
      error: () => console.error('Error carregant pacients')
    });
  }

  loadSetupData(): void {
    this.appointmentService.getSetupFormData().subscribe({
      next: (data) => {
        console.log('Datos de configuración recibidos:', data);
        this.doctorsList.set(data.doctors);
        this.boxesList.set(data.boxes);
      },
      error: (err) => console.error('Error cargando Doctors/Boxes', err)
    });
  }

  openNewAppointmentPanel(): void {
    this.showForm.set(true);
    this.loadPatients();
    this.loadSetupData();
  }

  closePanel(): void {
    this.showForm.set(false);
    this.isNewPatientMode = false;
  }

  saveAppointment(): void {
    if (this.isNewPatientMode && this.newAppointmentData.newPatientName) {
      const newPatient = {
        firstName: this.newAppointmentData.newPatientName,
        identityDocument: this.newAppointmentData.newPatientDni || '00000000X',
        lastName: 'Pendent'
      };

      this.appointmentService.createQuickPatient(newPatient).subscribe({
        next: (patientCreated: any) => {
          this.newAppointmentData.patient = patientCreated.id;
          this.executeSave();
        },
        error: (err) => alert('Error al crear el nou pacient')
      });
    } else {
      this.executeSave();
    }
  }

  private executeSave(): void {
    this.appointmentService.createAppointment(this.newAppointmentData).subscribe({
      next: () => {
        alert('Cita creada correctament');
        this.closePanel();
        this.fetchAppointments();
      },
      error: (err: any) => alert(err.error?.error || 'Error en crear la cita')
    });
  }

  openOdontogram(appointmentId: number): void {
    window.location.href = `/api/appointment/${appointmentId}/open`;
  }

  finishAppointment(appointmentId: number): void {
    if (confirm('Estàs segur que vols finalitzar aquesta cita?')) {
      this.appointmentService.closeAppointment(appointmentId).subscribe({
        next: () => this.fetchAppointments(),
        error: () => alert('Error al tancar la cita')
      });
    }
  }
}