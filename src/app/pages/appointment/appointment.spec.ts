import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
});
