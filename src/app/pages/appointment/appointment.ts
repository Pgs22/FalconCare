import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { AppointmentService } from '../../services/appointment.service';
import { Appointment } from '../../models/appointment.model';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appointment.html',
  styleUrl: './appointment.css',
})
export class AppointmentComponent implements OnInit {
  appointments = signal<Appointment[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private readonly appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.loadAppointments();
  }

  loadAppointments(): void {
    this.error.set(null);
    this.loading.set(true);

    this.appointmentService.getAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data);
      },
      error: (err: unknown) => {
        const httpError = err as HttpErrorResponse;
        if (httpError?.status === 0) {
          this.error.set('No se pudo conectar con Symfony. ¿Está el servidor encendido?');
        } else {
          this.error.set('Error al cargar las citas de la base de datos.');
        }
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      },
    });
  }
}