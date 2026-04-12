import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FEEDBACK_MESSAGE_AUTO_HIDE_MS } from '../../constants/feedback-message-timing';
import { rawToAgendaAppointment } from '../../models/appointment-api.util';
import { Appointment } from '../../models/appointment.model';
import { AppointmentService } from '../../services/appointment.service';

@Component({
  selector: 'app-appointment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appointment.html',
  styleUrl: './appointment.css',
})
export class AppointmentComponent implements OnInit, OnDestroy {
  appointments = signal<Appointment[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  private errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly appointmentService: AppointmentService) {}

  ngOnDestroy(): void {
    this.clearErrorDismissTimer();
  }

  ngOnInit(): void {
    this.fetchAppointments();
  }

  fetchAppointments(): void {
    this.clearErrorDismissTimer();
    this.error.set(null);
    this.loading.set(true);

    this.appointmentService.getAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data.map((row) => rawToAgendaAppointment(row)));
        this.loading.set(false);
      },
      error: (_err: unknown) => {
        this.error.set('No s’ha pogut connectar amb el servidor.');
        this.scheduleErrorAutoHide();
        this.loading.set(false);
      },
    });
  }

  private scheduleErrorAutoHide(): void {
    this.clearErrorDismissTimer();
    this.errorDismissTimer = setTimeout(() => {
      this.error.set(null);
      this.errorDismissTimer = null;
    }, FEEDBACK_MESSAGE_AUTO_HIDE_MS);
  }

  private clearErrorDismissTimer(): void {
    if (this.errorDismissTimer) {
      clearTimeout(this.errorDismissTimer);
      this.errorDismissTimer = null;
    }
  }
}