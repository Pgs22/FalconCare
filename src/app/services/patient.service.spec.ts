import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { PatientService } from './patient.service';
import { RealtimeSyncService } from './realtime-sync.service';

describe('PatientService', () => {
  let service: PatientService;
  let httpMock: HttpTestingController;
  let syncMock: jasmine.SpyObj<RealtimeSyncService>;

  beforeEach(() => {
    syncMock = jasmine.createSpyObj<RealtimeSyncService>('RealtimeSyncService', ['emit']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeSyncService, useValue: syncMock },
      ],
    });
    service = TestBed.inject(PatientService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('emits patients.changed and allergies.changed when updating medication allergies', () => {
    service.update(3, { medicationAllergies: 'PENICILINA' }).subscribe();

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/patients/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body['medication_allergies']).toBe('PENICILINA');
    req.flush({ id: 3 });

    expect(syncMock.emit).toHaveBeenCalledWith('patients.changed');
    expect(syncMock.emit).toHaveBeenCalledWith('allergies.changed');
  });

  it('emits only patients.changed when updating non-allergy fields', () => {
    service.update(4, { phone: '+34123456789' }).subscribe();

    const req = httpMock.expectOne('http://127.0.0.1:8000/api/patients/4');
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 4 });

    expect(syncMock.emit).toHaveBeenCalledWith('patients.changed');
    const allergyCalls = syncMock.emit.calls.allArgs().filter((args) => args[0] === 'allergies.changed');
    expect(allergyCalls.length).toBe(0);
  });

  it('rejects update when camel and snake allergy text differ', () => {
    let error: unknown = null;
    const payload: Record<string, unknown> = {
      medicationAllergies: 'PENICILINA',
      medication_allergies: 'LATEX',
    };
    service
      .update(7, payload as unknown as never)
      .subscribe({
        next: () => fail('expected validation error'),
        error: (err) => (error = err),
      });
    expect(String(error)).toContain('must match');
  });

  it('falls back appointment history routes in order', () => {
    let rows: unknown[] = [];
    service.getAppointments(5).subscribe((value) => (rows = value));

    const first = httpMock.expectOne('http://127.0.0.1:8000/api/patients/5/appointments');
    expect(first.request.method).toBe('GET');
    first.flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });

    const second = httpMock.expectOne((req) => {
      return req.url === 'http://127.0.0.1:8000/api/appointment/index' && req.params.get('patientId') === '5';
    });
    expect(second.request.params.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    second.flush({ message: 'bad request' }, { status: 400, statusText: 'Bad Request' });

    const third = httpMock.expectOne((req) => {
      return req.url === 'http://127.0.0.1:8000/api/appointments' && req.params.get('patientId') === '5';
    });
    third.flush([{ id: 10 }]);

    expect(rows.length).toBe(1);
  });
});
