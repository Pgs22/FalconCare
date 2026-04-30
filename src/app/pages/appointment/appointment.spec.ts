import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AppointmentComponent } from './appointment';
import { AppointmentService } from '../../services/appointment.service';

describe('AppointmentComponent', () => {
  let component: AppointmentComponent;
  let fixture: ComponentFixture<AppointmentComponent>;

  beforeEach(async () => {
      await TestBed.configureTestingModule({

        imports: [AppointmentComponent],

        providers: [
          AppointmentService,
          provideHttpClient(),
          provideHttpClientTesting()
        ]
      })
      .compileComponents();

      fixture = TestBed.createComponent(AppointmentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should only expose manual calendar status options', () => {
    expect(component.appointmentStatusOptions).toEqual(['Confirmada', 'Arribada', 'Cancelada']);
  });

  it('should display the appointment status returned by the backend', () => {
    expect(component.getAppointmentStatusDisplay('Programada')).toBe('Programada');
    expect(component.getAppointmentStatusDisplay('Falta consentiment')).toBe('Falta consentiment');
    expect(component.getAppointmentStatusDisplay('En curs')).toBe('En curs');
    expect(component.getAppointmentStatusDisplay('Finalitzada')).toBe('Finalitzada');
    expect(component.getAppointmentStatusDisplay('arribada')).toBe('Arribada');
    expect(component.getAppointmentStatusDisplay('cancelled')).toBe('Cancelada');
  });

  it('should normalize backend status fields before painting the calendar', () => {
    const normalized = (component as unknown as {
      normalizeIncomingAppointment(raw: unknown): { status: string };
    }).normalizeIncomingAppointment({
      id: 22,
      time: '11:00',
      appointment_status: 'arrived',
      patient_name: 'Pacient',
      doctorName: 'Doctora',
    });

    expect(normalized.status).toBe('Arribada');
    expect(component.getAppointmentStatusClass(normalized.status)).toBe('status-arribada');
  });

  it('should not treat automatic backend statuses as manual select options', () => {
    expect(component.isStatusSelectableFromCalendar('Programada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Falta consentiment')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('En curs')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Finalitzada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Confirmada')).toBeTrue();
  });

  it('should lock finalized appointments against manual status changes', () => {
    expect(component.isAppointmentStatusLocked('Finalitzada')).toBeTrue();
    expect(component.isAppointmentStatusLocked('Confirmada')).toBeFalse();
  });

  it('should keep finalized status returned by close appointment', () => {
    const appointmentService = TestBed.inject(AppointmentService);
    spyOn(window, 'confirm').and.returnValue(true);
    spyOn(appointmentService, 'closeAppointment').and.returnValue(of({
      ok: true,
      status: 'Finalitzada',
      appointment: { id: 10, status: 'Finalitzada' },
    }));
    const fetchSpy = spyOn(component, 'fetchAppointments');

    component.appointments.set([
      {
        id: 10,
        time: '10:00',
        duration: 30,
        cleaningTime: 5,
        totalBlockTime: 35,
        status: 'Confirmada',
        patientName: 'Pacient',
        doctorName: 'Doctora',
        boxId: 1,
        box: 'BOX 1',
        reason: '',
        color: '#2b7fff',
      },
    ]);

    component.finishAppointment(10);

    expect(component.appointments()[0].status).toBe('Finalitzada');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should block overlapping appointments for the same doctor in a different box', () => {
    const appointmentService = TestBed.inject(AppointmentService);
    const createSpy = spyOn(appointmentService, 'createAppointment').and.returnValue(of({ id: 99 }));
    spyOn(appointmentService, 'getAppointments').and.returnValue(of([
      {
        id: 1,
        time: '10:00',
        duration: 30,
        cleaningTime: 5,
        totalBlockTime: 35,
        status: 'Programada',
        patientName: 'Pacient existent',
        doctorName: 'Dr. Ana Torres',
        boxId: 1,
        box: 'BOX 1',
        reason: '',
        color: '#2b7fff',
        visitDate: '2026-05-01',
      },
    ]));

    component.doctorsList.set([{ id: 7, firstName: 'Ana', lastName: 'Torres' }]);
    component.boxesList.set([
      { id: 1, name: 'BOX 1' },
      { id: 2, name: 'BOX 2' },
    ]);

    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '3',
      doctor: '7',
      box: '2',
      visitDate: '2026-05-01',
      visitTime: '10:10',
      durationMinutes: 30,
    };

    component.saveAppointment();

    expect(createSpy).not.toHaveBeenCalled();
    expect(component.getCreateFieldError('visitTime')).toBe('Aquest doctor ja te una cita en aquest horari.');
  });
});
