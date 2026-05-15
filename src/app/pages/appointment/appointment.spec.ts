import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AppointmentComponent } from './appointment';
import { Appointment, AppointmentService } from '../../services/appointment.service';

describe('AppointmentComponent', () => {
  let component: AppointmentComponent;
  let fixture: ComponentFixture<AppointmentComponent>;
  let appointmentService: jasmine.SpyObj<AppointmentService>;
  let router: Router;

  const baseAppointments: Appointment[] = [
    {
      id: 1,
      time: '10:00',
      duration: 30,
      cleaningTime: 5,
      totalBlockTime: 35,
      status: 'Programada',
      doctorId: 7,
      patientId: 3,
      patientName: 'Marta Soler',
      doctorName: 'Ana Torres',
      boxId: 1,
      box: 'BOX 1',
      reason: 'Revisio',
      color: '#2b7fff',
      visitDate: '2026-05-01',
    },
    {
      id: 2,
      time: '11:00',
      duration: 45,
      cleaningTime: 10,
      totalBlockTime: 55,
      status: 'Confirmada',
      doctorId: 8,
      patientId: 4,
      patientName: 'Joan Puig',
      doctorName: 'Nil Roca',
      boxId: 2,
      box: 'BOX 2',
      reason: 'Endodoncia',
      color: '#00bcd4',
      visitDate: '2026-05-01',
      isUrgency: true,
    },
  ];

  const setupData = {
    doctors: [
      { id: 7, firstName: 'Ana', lastName: 'Torres' },
      { id: 8, name: 'Nil Roca' },
    ],
    boxes: [
      { id: 1, name: 'BOX 1' },
      { id: 2, name: 'BOX 2' },
    ],
    pathologies: [{ id: 12, name: 'Caries', duration: 40 }],
  };

  beforeEach(async () => {
    appointmentService = jasmine.createSpyObj<AppointmentService>('AppointmentService', [
      'getAppointments',
      'getWeeklyAppointments',
      'getSetupFormData',
      'getPatients',
      'getPatientTreatments',
      'createQuickPatient',
      'createAppointment',
      'updateAppointment',
      'deleteAppointment',
      'updateAppointmentStatus',
      'openAppointment',
      'closeAppointment',
    ]);
    appointmentService.getAppointments.and.returnValue(of(baseAppointments));
    appointmentService.getWeeklyAppointments.and.returnValue(of(baseAppointments));
    appointmentService.getSetupFormData.and.returnValue(of(setupData));
    appointmentService.getPatients.and.returnValue(of([
      { id: 3, firstName: 'Marta', lastName: 'Soler', lastOdontogramId: 101 },
      { id: 4, firstName: 'Joan', lastName: 'Puig', allergiesBitmask: 1 },
    ]));
    appointmentService.getPatientTreatments.and.returnValue(of([]));
    appointmentService.createAppointment.and.returnValue(of({ id: 99 }));
    appointmentService.createQuickPatient.and.returnValue(of({ id: 55 }));
    appointmentService.updateAppointment.and.returnValue(of({ ok: true }));
    appointmentService.deleteAppointment.and.returnValue(of({ ok: true }));
    appointmentService.updateAppointmentStatus.and.returnValue(of({ status: 'Arribada' }));
    appointmentService.openAppointment.and.returnValue(of({ appointment: { patientId: 3 } }));
    appointmentService.closeAppointment.and.returnValue(of({
      ok: true,
      appointment: { id: 1, status: 'Finalitzada' },
    }));

    await TestBed.configureTestingModule({
      imports: [AppointmentComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(AppointmentComponent);
    component = fixture.componentInstance;
    component.newAppointmentData.visitDate = '2026-05-01';
    fixture.detectChanges();
  });

  afterEach(() => {
    const alertSpy = (window.alert as unknown as jasmine.Spy | undefined);
    if (alertSpy?.and) {
      alertSpy.calls.reset();
    }
  });

  it('should create and load the day agenda setup on init', () => {
    expect(component).toBeTruthy();
    expect(appointmentService.getAppointments).toHaveBeenCalledWith('2026-05-01');
    expect(appointmentService.getPatients).toHaveBeenCalled();
    expect(appointmentService.getSetupFormData).toHaveBeenCalledWith('2026-05-01');
    expect(component.appointments().length).toBe(2);
    expect(component.doctorsList()).toEqual(setupData.doctors);
    expect(component.boxesList()).toEqual(setupData.boxes);
  });

  it('should switch between day and week views and group weekly appointments by date', () => {
    component.setViewMode('week');

    expect(component.isWeekView()).toBeTrue();
    expect(appointmentService.getWeeklyAppointments).toHaveBeenCalledWith('2026-05-01');
    expect(component.getAppointmentsForWeekDay('2026-05-01').map((item) => item.id)).toEqual([1, 2]);

    component.setViewMode('day');

    expect(component.isDayView()).toBeTrue();
  });

  it('should update the selected date and reload day, week and setup data', () => {
    component.setViewMode('week');
    appointmentService.getAppointments.calls.reset();
    appointmentService.getWeeklyAppointments.calls.reset();
    appointmentService.getSetupFormData.calls.reset();

    component.onDateChange('2026-05-08');

    expect(component.newAppointmentData.visitDate).toBe('2026-05-08');
    expect(appointmentService.getAppointments).toHaveBeenCalledWith('2026-05-08');
    expect(appointmentService.getWeeklyAppointments).toHaveBeenCalledWith('2026-05-08');
    expect(appointmentService.getSetupFormData).toHaveBeenCalledWith('2026-05-08');
    expect(component.weekDays()[0].date).toBe('2026-05-04');
  });

  it('should filter visible appointments by selected box and doctor in week view', () => {
    component.setViewMode('week');

    component.onWeekBoxSelected('id:2');
    component.onWeekDoctorSelected('id:8');

    expect(component.getVisibleBoxes().map((box) => component.getBoxLabel(box))).toEqual(['BOX 2']);
    expect(component.getVisibleAppointmentsForWeekDay('2026-05-01').map((item) => item.id)).toEqual([2]);
    expect(component.getTotalAppointmentsForVisibleBoxes('2026-05-01')).toBe(1);
  });

  it('should toggle box filters and the all-boxes selector', () => {
    const box1 = setupData.boxes[0];

    expect(component.areAllBoxesSelected()).toBeTrue();

    component.toggleBoxSelection(box1, false);

    expect(component.isBoxSelected(box1)).toBeFalse();
    expect(component.getVisibleBoxes().map((box) => component.getBoxLabel(box))).toEqual(['BOX 2']);

    component.toggleAllBoxes(true);

    expect(component.areAllBoxesSelected()).toBeTrue();
  });

  it('should calculate appointment and cleaning positions from time and duration', () => {
    const appointment = baseAppointments[0];

    expect(component.getAppointmentTopPx(appointment)).toBe(300);
    expect(component.getAppointmentHeightPx(appointment)).toBe(73);
    expect(component.getCleaningTopPx(appointment)).toBe(376);
    expect(component.getCleaningHeightPx(appointment)).toBe(12.5);
    expect(component.getAppointmentTimeRange(appointment)).toBe('10:00 - 10:30');
  });

  it('should open a new appointment panel with defaults and close it resetting the form', () => {
    component.newAppointmentData.visitTime = '';

    component.openNewAppointmentPanel();

    expect(component.showForm()).toBeTrue();
    expect(component.isEditMode).toBeFalse();
    expect(component.newAppointmentData.visitTime).toBe('08:00');
    expect(appointmentService.getPatients).toHaveBeenCalled();

    component.newAppointmentData.patient = '3';
    component.closePanel();

    expect(component.showForm()).toBeFalse();
    expect(component.newAppointmentData.patient).toBe('');
    expect(component.newAppointmentData.durationMinutes).toBe(30);
  });

  it('should apply first visit, urgency, patient allergy and treatment defaults', () => {
    component.patientsList.set([
      { id: 4, firstName: 'Joan', lastName: 'Puig', allergiesBitmask: 1 },
    ]);
    appointmentService.getPatientTreatments.and.returnValue(of([
      {
        treatmentId: 20,
        pathologyId: 12,
        durationMinutes: 50,
        treatmentName: 'Endodoncia',
      },
    ]));

    component.onPatientChange(4);
    component.onTreatmentSelect(20);

    expect(component.newAppointmentData.isFirstVisit).toBeTrue();
    expect(component.getSelectedPatientAllergyText()).toContain('Penicil');
    expect(component.newAppointmentData.pathologyId).toBe('12');
    expect(component.newAppointmentData.durationMinutes).toBe(50);
    expect(component.newAppointmentData.consultationReason).toBe('Seguiment: Endodoncia');

    component.newAppointmentData.isUrgency = true;
    component.onUrgencyChange();

    expect(component.newAppointmentData.isFirstVisit).toBeFalse();
    expect(component.newAppointmentData.consultationReason).toBe('Urgència');
  });

  it('should validate required fields before creating an appointment', () => {
    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '',
      doctor: '',
      box: '',
    };

    component.saveAppointment();

    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    expect(component.createFormError()).toBe('Revisa els camps marcats del formulari.');
    expect(component.getCreateFieldError('patient')).toContain('pacient');
    expect(component.getCreateFieldError('doctor')).toContain('doctor');
    expect(component.getCreateFieldError('box')).toContain('box');
  });

  it('should create an appointment with normalized payload and refresh the agenda', () => {
    spyOn(window, 'alert');
    appointmentService.getAppointments.calls.reset();
    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '3',
      doctor: '7',
      box: '1',
      visitDate: '2026-05-01',
      visitTime: '12:05',
      durationMinutes: 40,
      pathologyId: '12',
      consultationReason: 'Control',
    };

    component.saveAppointment();

    expect(appointmentService.createAppointment).toHaveBeenCalledWith(jasmine.objectContaining({
      patient: 3,
      doctor: 7,
      box: 1,
      visitDate: '2026-05-01',
      visitTime: '12:05:00',
      duration: 40,
      pathology: 12,
      consultationReason: 'Control',
    }));
    expect(component.showForm()).toBeFalse();
    expect(appointmentService.getAppointments).toHaveBeenCalledWith(jasmine.any(String));
  });

  it('should create a quick patient before saving when new patient mode is enabled', () => {
    spyOn(window, 'alert');
    component.isNewPatientMode = true;
    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '',
      newPatientName: 'Laia Costa',
      newPatientDni: '12345678Z',
      doctor: '7',
      box: '1',
      visitDate: '2026-05-01',
      visitTime: '12:30',
      durationMinutes: 30,
    };

    component.saveAppointment();

    expect(appointmentService.createQuickPatient).toHaveBeenCalledWith({
      firstName: 'Laia Costa',
      identityDocument: '12345678Z',
      lastName: 'Pendent',
    });
    expect(appointmentService.createAppointment).toHaveBeenCalledWith(jasmine.objectContaining({
      patient: 55,
    }));
  });

  it('should block overlapping appointments for the same doctor in a different box', () => {
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

    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    expect(component.getCreateFieldError('visitTime')).toBe('Aquest doctor ja te una cita en aquest horari.');
  });

  it('should block overlapping appointments for the same box', () => {
    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '3',
      doctor: '8',
      box: '1',
      visitDate: '2026-05-01',
      visitTime: '10:20',
      durationMinutes: 30,
    };

    component.saveAppointment();

    expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    expect(component.getCreateFieldError('visitTime')).toBe('Aquest box ja te una cita en aquest horari.');
  });

  it('should surface backend field errors when create fails', () => {
    appointmentService.getAppointments.and.returnValue(of([]));
    appointmentService.createAppointment.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: {
        code: 'APPOINTMENT_VALIDATION_ERROR',
        error: {
          field: 'visitTime',
        },
      },
    })));
    component.newAppointmentData = {
      ...component.newAppointmentData,
      patient: '3',
      doctor: '7',
      box: '1',
      visitDate: '2026-05-01',
      visitTime: '13:00',
      durationMinutes: 30,
    };

    component.saveAppointment();

    expect(component.getCreateFieldError('visitTime')).toBeTruthy();
    expect(component.createFormError()).toBeTruthy();
  });

  it('should open edit mode from quick actions and update an appointment', () => {
    spyOn(window, 'alert');
    component.onQuickActionSelected(baseAppointments[0], 'editar');

    expect(component.showForm()).toBeTrue();
    expect(component.isEditMode).toBeTrue();
    expect(component.newAppointmentData.patient).toBe('3');
    expect(component.newAppointmentData.doctor).toBe('7');
    expect(component.newAppointmentData.box).toBe('1');

    component.newAppointmentData.visitTime = '14:00';
    component.saveAppointment();

    expect(appointmentService.updateAppointment).toHaveBeenCalledWith(1, jasmine.objectContaining({
      patient: 3,
      doctor: 7,
      box: 1,
      visitTime: '14:00:00',
    }));
  });

  it('should delete an appointment from quick actions after confirmation', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.setViewMode('week');
    appointmentService.getAppointments.calls.reset();
    appointmentService.getWeeklyAppointments.calls.reset();

    component.onQuickActionSelected(baseAppointments[0], 'eliminar');

    expect(appointmentService.deleteAppointment).toHaveBeenCalledWith(1);
    expect(appointmentService.getAppointments).toHaveBeenCalled();
    expect(appointmentService.getWeeklyAppointments).toHaveBeenCalled();
  });

  it('should update appointment status in day and week agenda collections', () => {
    component.setViewMode('week');
    component.onAppointmentStatusSelected(baseAppointments[0], 'Arribada');

    expect(appointmentService.updateAppointmentStatus).toHaveBeenCalledWith(1, 'Arribada');
    expect(component.appointments().find((item) => item.id === 1)?.status).toBe('Arribada');
    expect(component.weeklyAppointments()['2026-05-01'].find((item) => item.id === 1)?.status).toBe('Arribada');
    expect(component.statusUpdatingIds()).toEqual([]);
  });

  it('should keep finalized appointments locked against manual status changes', () => {
    const finalized = { ...baseAppointments[0], status: 'Finalitzada' };

    component.onAppointmentStatusSelected(finalized, 'Cancelada');

    expect(appointmentService.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it('should update cleaning buffer only with allowed values and refresh week view', () => {
    spyOn(window, 'alert');
    component.setViewMode('week');
    component.setAppointmentCleaningBuffer(baseAppointments[0], 10);

    expect(appointmentService.updateAppointment).toHaveBeenCalledWith(1, jasmine.objectContaining({
      cleaningMinutes: 10,
      cleaningTime: 10,
      totalBlockTime: 40,
    }));

    component.setAppointmentCleaningBuffer(baseAppointments[0], 20);

    expect(window.alert).toHaveBeenCalledWith('La neteja del box nomes pot ser de 5, 10 o 15 minuts.');
  });

  it('should open the odontogram for the appointment patient', () => {
    component.openOdontogram(baseAppointments[0]);

    expect(appointmentService.openAppointment).toHaveBeenCalledWith(1);
    expect(router.navigate).toHaveBeenCalledWith(['/odontogram'], {
      queryParams: {
        patientId: 3,
        visitId: 1,
      },
    });
  });

  it('should finish an appointment and keep the backend final status', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.finishAppointment(1);

    expect(appointmentService.closeAppointment).toHaveBeenCalledWith(1);
    expect(component.appointments().find((item) => item.id === 1)?.status).toBe('Finalitzada');
  });

  it('should only expose manual calendar status options and normalize backend statuses', () => {
    const normalized = (component as unknown as {
      normalizeIncomingAppointment(raw: unknown): Appointment;
    }).normalizeIncomingAppointment({
      id: 22,
      time: '11:00',
      appointment_status: 'arrived',
      patient_name: 'Pacient',
      doctorName: 'Doctora',
    });

    expect(component.appointmentStatusOptions).toEqual(['Confirmada', 'Arribada', 'Cancelada']);
    expect(component.getAppointmentStatusDisplay('cancelled')).toBe('Cancelada');
    expect(component.isStatusSelectableFromCalendar('Programada')).toBeFalse();
    expect(component.isStatusSelectableFromCalendar('Confirmada')).toBeTrue();
    expect(component.isAppointmentStatusLocked('Finalitzada')).toBeTrue();
    expect(normalized.status).toBe('Arribada');
    expect(component.getAppointmentStatusClass(normalized.status)).toBe('status-arribada');
  });
});
