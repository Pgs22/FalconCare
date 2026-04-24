import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';

import { AppointmentService } from '../../services/appointment.service';
import { DoctorPanelComponent } from './doctor-panel';
import { RealtimeSyncService, SyncEvent } from '../../services/realtime-sync.service';

describe('DoctorPanelComponent', () => {
  let fixture: ComponentFixture<DoctorPanelComponent>;
  let component: DoctorPanelComponent;
  let syncEvents$: Subject<SyncEvent>;

  beforeEach(async () => {
    syncEvents$ = new Subject<SyncEvent>();
    await TestBed.configureTestingModule({
      imports: [DoctorPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: AppointmentService,
          useValue: { getAppointments: () => of([]) },
        },
        {
          provide: RealtimeSyncService,
          useValue: {
            stream: () => syncEvents$.asObservable(),
            emit: () => void 0,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('refreshes dashboard when sync topic arrives', () => {
    const refreshSpy = spyOn<any>(component, 'loadDashboardAppointmentStats').and.callThrough();
    syncEvents$.next({
      topic: 'allergies.changed',
      at: Date.now(),
      source: 'server',
    });
    expect(refreshSpy).toHaveBeenCalled();
  });
});
