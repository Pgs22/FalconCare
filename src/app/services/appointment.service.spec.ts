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
      responseBody = response;
    });

    const req = httpMock.expectOne('http://localhost:8000/api/appointment/63/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ stateName: 'confirmed' });
    expect(req.request.withCredentials).toBeTrue();

    req.flush('ok');
    expect(responseBody).toBe('ok');
  });

  it('should send cancelled canonical status for Cancel·lada', () => {
    service.updateAppointmentStatus(64, 'Cancel·lada').subscribe();

    const req = httpMock.expectOne('http://localhost:8000/api/appointment/64/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ stateName: 'cancelled' });

    req.flush('ok');
  });

  it('should fallback to status key when stateName payload fails', () => {
    service.updateAppointmentStatus(65, 'Confirmada').subscribe();

    const firstReq = httpMock.expectOne('http://localhost:8000/api/appointment/65/status');
    expect(firstReq.request.body).toEqual({ stateName: 'confirmed' });
    firstReq.flush('boom', { status: 500, statusText: 'Server Error' });

    const secondReq = httpMock.expectOne('http://localhost:8000/api/appointment/65/status');
    expect(secondReq.request.body).toEqual({ status: 'confirmed' });
    secondReq.flush('ok');
  });
});
