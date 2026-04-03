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
  loading = signal(false);
  error = signal<string | null>(null);
  showForm = signal(false);

  // Data model for the new appointment form
  newAppointmentData = {
    patient: '',
    doctor: '',
    box: '',
    visitDate: '',
    visitTime: '',
    treatment: '',
    consultationReason: '',
    durationMinutes: 30,
    isFirstVisit: false,
    isUrgency: false
  };

  constructor(private readonly appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.fetchAppointments();
  }

  // Fetches appointments from the server
  // Recull les cites del servidor
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

  // Opens the side panel for a new appointment
  // Obre el panell lateral
  openNewAppointmentPanel(): void {
    this.showForm.set(true);
  }

  // Closes the panel and resets the form
  // Tanca el panell lateral
  closePanel(): void {
    this.showForm.set(false);
  }

  // Saves the appointment using the service
  // Guarda la cita mitjançant el servei
  saveAppointment(): void {
    this.appointmentService.createAppointment(this.newAppointmentData).subscribe({
      next: (res: any) => {
        alert('Cita creada correctament');
        this.showForm.set(false);
        this.fetchAppointments();
      },
      error: (err: any) => {
        alert(err.error?.error || 'Error en crear la cita');
      }
    });
  }

  // Opens Symfony's odontogram
  // Obre l'odontograma de Symfony
  openOdontogram(appointmentId: number): void {
    window.location.href = `/api/appointment/${appointmentId}/open`;
  }

  // Closes/Finishes the appointment
  // Finalitza la cita
  finishAppointment(appointmentId: number): void {
    if (confirm('Estàs segur que vols finalitzar aquesta cita?')) {
      this.appointmentService.closeAppointment(appointmentId).subscribe({
        next: () => this.fetchAppointments(),
        error: () => alert('Error al tancar la cita')
      });
    }
  }
}