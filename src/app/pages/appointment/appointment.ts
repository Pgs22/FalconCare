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
        time: '09:00', 
        duration: 60, 
        status: 'confirmed', 
        patientName: 'Amanda Smith', 
        doctorName: 'Dra. Sarah Jenkins', 
        box: 'BOX 1', 
        reason: 'Ortodòncia' 
      },
      { 
        id: 2, 
        time: '12:00', 
        duration: 90, 
        status: 'pending', 
        patientName: 'Eleanor Pena', 
        doctorName: 'Dr. Michael Ross', 
        box: 'BOX 2', 
        reason: 'Sensibilitat molar' 
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