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
  });

  it('should not treat automatic backend statuses as manual select options', () => {
    expect(component.isStatusSelectableFromCalendar('Programada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Falta consentiment')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('En curs')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Finalitzada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Confirmada')).toBeTrue();
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
