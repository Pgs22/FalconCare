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
  pathologiesList = signal<any[]>([]);
  treatmentsList = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  showForm = signal(false);
  isEditMode = false;

  isNewPatientMode = false;

  newAppointmentData = {
    patient: '',
    newPatientName: '',
    newPatientDni: '',
    doctor: '',
    box: '',
    pathologyId: '',
    treatmentId: '',
    visitDate: new Date().toISOString().split('T')[0],
    visitTime: '',
    consultationReason: '',
    durationMinutes: 30,
    isFirstVisit: false,
    isUrgency: false
  };

  constructor(private readonly appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.fetchAppointments();
    this.loadPatients();
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  toggleNewPatientMode(): void {
    this.isNewPatientMode = !this.isNewPatientMode;
    
    if (this.isNewPatientMode) {
      this.newAppointmentData.patient = '';
      this.newAppointmentData.isFirstVisit = true;
      this.onFirstVisitChange();
    } else {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30;
    }
  }

  onFirstVisitChange(): void {
    if (this.newAppointmentData.isFirstVisit) {
      this.newAppointmentData.isUrgency = false;
      this.newAppointmentData.durationMinutes = 60;
      this.newAppointmentData.consultationReason = 'Primera Visita / Revisió';
    }
  }

  onUrgencyChange(): void {
    if (this.newAppointmentData.isUrgency) {
      this.newAppointmentData.isFirstVisit = false;
      this.newAppointmentData.durationMinutes = 30;
      this.newAppointmentData.consultationReason = 'Urgència';
    }
  }

  onPatientChange(patientId: any): void {
    this.treatmentsList.set([]);
    this.newAppointmentData.treatmentId = '';
    this.newAppointmentData.pathologyId = '';

    if (!patientId) return;

    this.appointmentService.getPatientTreatments(patientId).subscribe({
      next: (data) => {
        console.log('Tratamientos recibidos de la API:', data);
        this.treatmentsList.set(data);
      },
      error: (err) => console.error('Error al cargar tratamientos', err)
    });
  }

  onTreatmentSelect(tId: any): void {
    if (!tId || tId === "") {
      this.newAppointmentData.durationMinutes = 30; // Valor por defecto si desmarcas
      this.newAppointmentData.pathologyId = '';
      return;
    }

    const selected = this.treatmentsList().find(t => t.treatmentId == tId);
    
    if (selected) {
      this.newAppointmentData.pathologyId = selected.pathologyId;
      
      this.newAppointmentData.durationMinutes = selected.duration; 
      
      this.newAppointmentData.consultationReason = `Seguiment: ${selected.treatmentName}`;
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

  loadSetupData(date?: string): void {
    const dateToFetch = date || this.newAppointmentData.visitDate;

    this.appointmentService.getSetupFormData(dateToFetch).subscribe({
      next: (data) => {
        console.log('--- REVISIÓN DE DATOS ---');
        console.log('Objeto completo recibido:', data);
        
        if (data) {
          if (data.doctors) console.table(data.doctors);
          if (data.boxes) console.table(data.boxes);
          this.pathologiesList.set(data.pathologies || []);

          this.doctorsList.set(data.doctors || []);
          this.boxesList.set(data.boxes || []);
        }
      },
      error: (err) => console.error('Error al cargar infraestructura:', err)
    });
  }

  onDateChange(): void {
    console.log('Nueva fecha detectada:', this.newAppointmentData.visitDate);
    this.newAppointmentData.doctor = ''; 
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  openNewAppointmentPanel(): void {
    this.showForm.set(true);
    this.loadPatients();
    this.loadSetupData(this.newAppointmentData.visitDate);
  }

  closePanel(): void {
    this.showForm.set(false);
    this.isNewPatientMode = false;
    this.newAppointmentData = {
      patient: '',
      newPatientName: '',
      newPatientDni: '',
      doctor: '',
      box: '',
      pathologyId: '',
      treatmentId: '',
      visitDate: new Date().toISOString().split('T')[0],
      visitTime: '',
      consultationReason: '',
      durationMinutes: 30,
      isFirstVisit: false,
      isUrgency: false
    };
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
    const dataToSend = {
      patient: Number(this.newAppointmentData.patient),
      doctor: Number(this.newAppointmentData.doctor),
      box: Number(this.newAppointmentData.box),
      visitDate: this.newAppointmentData.visitDate,
      visitTime: this.newAppointmentData.visitTime,
      
      // PRUEBA ESTO: Envía ambos nombres si no estás seguro de cuál usa el backend
      // Si el FormType usa 'duration', recibirá 'duration'. Si usa 'durationMinutes', también.
      duration: Number(this.newAppointmentData.durationMinutes),
      durationMinutes: Number(this.newAppointmentData.durationMinutes),
      
      consultationReason: this.newAppointmentData.consultationReason || '',
      
      // Asegúrate de que este nombre coincida con el ->add('treatment') del FormType
      treatment: this.newAppointmentData.treatmentId ? Number(this.newAppointmentData.treatmentId) : null,
      
      isFirstVisit: !!this.newAppointmentData.isFirstVisit,
      isUrgency: !!this.newAppointmentData.isUrgency
    };

    this.appointmentService.createAppointment(dataToSend).subscribe({
      next: () => {
        alert('Cita creada!');
        this.closePanel();
        this.fetchAppointments();
      },
      error: (err) => {
        // ESTO ES CLAVE: Mira la pestaña "Network" -> "Response" en Chrome
        console.error('Respuesta cruda del servidor:', err.error);
        alert('Error: ' + (err.error?.errors || 'Dades invàlides'));
      }
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