import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AppointmentService } from './appointment.service';

describe('AppointmentService', () => {
  let service: AppointmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppointmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send confirmed canonical status for Confirmada', () => {
    let responseBody = '';

    service.updateAppointmentStatus(63, 'Confirmada').subscribe((response) => {
      responseBody = String(response.status);
    });

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/63/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Confirmada' });
    req.flush(JSON.stringify({ ok: true, status: 'Confirmada' }));
    expect(responseBody).toBe('Confirmada');
  });

  it('should send arrived canonical status for Arribada', () => {
    let responseBody = '';

    service.updateAppointmentStatus(66, 'Arribada').subscribe((response) => {
      responseBody = String(response.status);
    });

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/66/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Arribada' });

    req.flush('ok');
    expect(responseBody).toBe('Arribada');
  });

  it('should send cancelled canonical status for Cancelada', () => {
    service.updateAppointmentStatus(64, 'Cancelada').subscribe();

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/64/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Cancelada' });

    req.flush(JSON.stringify({ ok: true, status: 'Cancelada' }));
  });

  it('should fallback from PATCH to PUT with the same status body', () => {
    service.updateAppointmentStatus(65, 'Confirmada').subscribe();

    const firstReq = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/65/status');
    expect(firstReq.request.method).toBe('PATCH');
    expect(firstReq.request.body).toEqual({ status: 'Confirmada' });
    firstReq.flush('boom', { status: 500, statusText: 'Server Error' });

    const secondReq = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/65/status');
    expect(secondReq.request.method).toBe('PUT');
    expect(secondReq.request.body).toEqual({ status: 'Confirmada' });
    secondReq.flush(JSON.stringify({ ok: true, status: 'Confirmada' }));
  });

  it('should not fallback to PUT when backend rejects an invalid status', () => {
    let receivedCode = '';

    service.updateAppointmentStatus(65, 'En curs').subscribe({
      error: (err) => {
        const payload =
          typeof err.error === 'string'
            ? (JSON.parse(err.error) as { code?: string })
            : (err.error as { code?: string } | null);
        receivedCode = String(payload?.code ?? '');
      },
    });

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/65/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'En curs' });
    expect(req.request.responseType).toBe('text');

    req.flush(JSON.stringify({ ok: false, code: 'INVALID_STATUS' }), {
      status: 400,
      statusText: 'Bad Request',
    });
    httpMock.expectNone('http://127.0.0.1:8000/api/appointment/65/status');
    expect(receivedCode).toBe('INVALID_STATUS');
  });

  it('should load official appointment statuses', () => {
    service.getAppointmentStatuses().subscribe((response) => {
      expect(response.manualStatuses).toEqual(['Confirmada', 'Arribada', 'Cancelada']);
    });

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/statuses');
    expect(req.request.method).toBe('GET');
    req.flush({
      statuses: ['Programada', 'Confirmada', 'En curs', 'Arribada', 'Cancelada', 'Finalitzada', 'Falta consentiment'],
      manualStatuses: ['Confirmada', 'Arribada', 'Cancelada'],
    });
  });

  it('should use GET for openAppointment', () => {
    service.openAppointment(77).subscribe();

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/77/open');
    expect(req.request.method).toBe('GET');

    req.flush({ ok: true });
  });

  it('should update appointments with PUT and propagate doctor occupied conflicts', () => {
    const received: { status?: number; code?: string } = {};

    service.updateAppointment(12, {
      doctor: 7,
      box: 2,
      visitDate: '2026-04-24',
      visitTime: '13:45:00',
      durationMinutes: 30,
    }).subscribe({
      error: (err) => {
        received.status = err.status;
        received.code = err.error?.code;
      },
    });

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/appointment/12/update');
    expect(req.request.method).toBe('PUT');

    req.flush({
      ok: false,
      code: 'DOCTOR_OCCUPIED',
      error: {
        messageKey: 'appointment.doctor.occupied',
        message: 'El doctor ya tiene una cita en ese horario.',
      },
    }, { status: 409, statusText: 'Conflict' });

    expect(received.status).toBe(409);
    expect(received.code).toBe('DOCTOR_OCCUPIED');
  });
});
