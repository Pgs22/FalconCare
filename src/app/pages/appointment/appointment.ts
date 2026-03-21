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

  // ngOnInit(): void {
  //   this.fetchAppointments();
  // }

  // fetchAppointments(): void {
  //   this.error.set(null);
  //   this.loading.set(true);

  //   this.appointmentService.getAppointments().subscribe({
  //     next: (data) => {
  //       this.appointments.set(data);
  //       this.loading.set(false);
  //     },
  //     error: (err) => {
  //       this.error.set('No s’ha pogut connectar amb el servidor.');
  //       this.loading.set(false);
  //     }
  //   });
  // }

  ngOnInit(): void {
    this.loading.set(true);

    const mockData: Appointment[] = [
{ 
      id: 1, 
      visit_date: '2026-03-21',
      visit_time: '09:00', 
      consultation_reason: 'Neteja bucal',
      observations: 'Pacient amb sensibilitat',
      status: 'confirmed', 
      duration_minutes: 30,
      patient_id: 10,
      doctor_id: 1,
      box_id: 1
    },
    { 
      id: 2, 
      visit_date: '2026-03-21',
      visit_time: '10:00', 
      consultation_reason: 'Revisió ortodòncia',
      observations: 'Canviar gomes',
      status: 'pending', 
      duration_minutes: 15,
      patient_id: 25,
      doctor_id: 1,
      box_id: 2
    }
  ];


    this.appointments.set(mockData);
    this.loading.set(false);

  }

  fetchAppointments(): void {
    this.error.set(null);
    this.loading.set(true);

    this.appointmentService.getAppointments().subscribe({
      next: (data) => {
        this.appointments.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('No s’ha pogut connectar amb el servidor.');
        this.loading.set(false);
      }
    });
  }
}