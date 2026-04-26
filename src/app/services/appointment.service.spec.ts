import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../environments/environment';
import { AppointmentService } from './appointment.service';

describe('AppointmentService', () => {
  let service: AppointmentService;
  let httpMock: HttpTestingController;
  const appointmentBaseUrl = `${environment.apiBaseUrl}/api/appointment`;

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
      responseBody = response;
    });

    const req = httpMock.expectOne(`${appointmentBaseUrl}/63/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Confirmada' });
    expect(req.request.withCredentials).toBeTrue();

    req.flush('ok');
    expect(responseBody).toBe('ok');
  });

  it('should send arrived canonical status for Arribada', () => {
    service.updateAppointmentStatus(66, 'Arribada').subscribe();

    const req = httpMock.expectOne(`${appointmentBaseUrl}/66/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Arribada' });

    req.flush('ok');
  });

  it('should send cancelled canonical status for Cancelada', () => {
    service.updateAppointmentStatus(64, 'Cancelada').subscribe();

    const req = httpMock.expectOne(`${appointmentBaseUrl}/64/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Cancelada' });

    req.flush('ok');
  });

  it('should canonicalize manual status aliases from other languages', () => {
    service.updateAppointmentStatus(67, 'confirmed').subscribe();

    const req = httpMock.expectOne(`${appointmentBaseUrl}/67/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'Confirmada' });

    req.flush('ok');
  });

  it('should fallback from JSON PATCH to text PATCH and PUT variants', () => {
    service.updateAppointmentStatus(65, 'Confirmada').subscribe();

    const firstReq = httpMock.expectOne(`${appointmentBaseUrl}/65/status`);
    expect(firstReq.request.method).toBe('PATCH');
    expect(firstReq.request.body).toEqual({ status: 'Confirmada' });
    firstReq.flush('boom', { status: 500, statusText: 'Server Error' });

    const secondReq = httpMock.expectOne(`${appointmentBaseUrl}/65/status`);
    expect(secondReq.request.method).toBe('PATCH');
    expect(secondReq.request.body).toBe('Confirmada');
    secondReq.flush('boom', { status: 415, statusText: 'Unsupported Media Type' });

    const thirdReq = httpMock.expectOne(`${appointmentBaseUrl}/65/status`);
    expect(thirdReq.request.method).toBe('PUT');
    expect(thirdReq.request.body).toEqual({ status: 'Confirmada' });
    thirdReq.flush('boom', { status: 405, statusText: 'Method Not Allowed' });

    const fourthReq = httpMock.expectOne(`${appointmentBaseUrl}/65/status`);
    expect(fourthReq.request.method).toBe('PUT');
    expect(fourthReq.request.body).toBe('Confirmada');
    fourthReq.flush('ok');
  });

  it('should use GET for openAppointment', () => {
    service.openAppointment(77).subscribe();

    const req = httpMock.expectOne(`${appointmentBaseUrl}/77/open`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();

    req.flush({ ok: true });
  });
});
