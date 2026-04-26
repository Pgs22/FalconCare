import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
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
          provideRouter([]),
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
  });

  it('should not treat automatic backend statuses as manual select options', () => {
    expect(component.isStatusSelectableFromCalendar('Programada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Falta consentiment')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('En curs')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Finalitzada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Confirmada')).toBeTrue();
    expect(component.isStatusSelectableFromCalendar('confirmed')).toBeTrue();
    expect(component.isStatusSelectableFromCalendar('arrived')).toBeTrue();
    expect(component.isStatusSelectableFromCalendar('cancelled')).toBeTrue();
  });

  it('should detect when a doctor already has an appointment in another box at that time', () => {
    component.doctorsList.set([{ id: 7, name: 'Doctor Test' }]);
    component.boxesList.set([{ id: 1, name: 'Box 1' }, { id: 2, name: 'Box 2' }]);
    component.appointments.set([
      {
        id: 101,
        time: '10:00',
        duration: 30,
        cleaningTime: 5,
        totalBlockTime: 35,
        status: 'Programada',
        patientName: 'Pacient',
        doctorId: 7,
        doctorName: 'Doctor Test',
        boxId: 1,
        box: 'Box 1',
        reason: '',
        color: '#2b7fff',
        visitDate: '2026-04-26',
      },
    ]);

    const hasConflict = (component as any).hasDoctorCrossBoxConflict(7, '2026-04-26', '10:00', 30, 2, null);
    const sameBox = (component as any).hasDoctorCrossBoxConflict(7, '2026-04-26', '10:00', 30, 1, null);

    expect(hasConflict).toBeTrue();
    expect(sameBox).toBeFalse();
  });

  it('should resolve backend doctor occupied errors', () => {
    const err = {
      status: 409,
      error: {
        ok: false,
        code: 'DOCTOR_OCCUPIED',
        error: {
          messageKey: 'appointment.doctor.occupied',
          message: 'El doctor ya tiene una cita en ese horario.',
        },
      },
    };

    expect((component as any).isDoctorOccupiedError(err)).toBeTrue();
    expect((component as any).resolveCreateErrorMessage(err)).toBe(
      'Aquest doctor ja té una cita en aquest horari.'
    );
  });
});
