import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AppointmentService } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { DocumentService } from '../../services/document.service';
import { PatientService } from '../../services/patient.service';
import { PatientPanelComponent } from './patient-panel';

describe('PatientPanelComponent', () => {
  let fixture: ComponentFixture<PatientPanelComponent>;
  let component: PatientPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientPanelComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ patientId: '1' })),
          },
        },
        {
          provide: PatientService,
          useValue: {
            getById: () =>
              of({
                id: 1,
                firstName: 'Ana',
                lastName: 'García',
                phone: '+34123456789',
                email: 'ana@test.com',
                address: 'Calle 1, 2, Madrid',
              }),
          },
        },
        { provide: AuthService, useValue: { logout: jasmine.createSpy('logout') } },
        {
          provide: AppointmentService,
          useValue: {
            listByPatientId: () => of([]),
          },
        },
        {
          provide: DocumentService,
          useValue: {
            listByPatientId: () => of([]),
            create: () => of({ id: 1 }),
            download: (_id: number, _patientId: number) => of(new Blob()),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
