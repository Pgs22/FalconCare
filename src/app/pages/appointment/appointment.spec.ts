import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppointmentComponent } from './appointment';
import { AppointmentService } from '../../services/appointment.service';
import { provideRouter } from '@angular/router';
import { RealtimeSyncService, SyncEvent } from '../../services/realtime-sync.service';
import { Subject } from 'rxjs';

describe('AppointmentComponent', () => {
  let component: AppointmentComponent;
  let fixture: ComponentFixture<AppointmentComponent>;
  let syncEvents$: Subject<SyncEvent>;

  beforeEach(async () => {
      syncEvents$ = new Subject<SyncEvent>();
      await TestBed.configureTestingModule({

        imports: [AppointmentComponent],

        providers: [
          AppointmentService,
          {
            provide: RealtimeSyncService,
            useValue: {
              stream: () => syncEvents$.asObservable(),
              emit: () => void 0,
            },
          },
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

  it('triggers refresh flow on allergies.changed sync event', () => {
    const refreshSpy = spyOn<any>(component, 'refreshAgendaAndAllergies').and.callThrough();
    syncEvents$.next({
      topic: 'allergies.changed',
      at: Date.now(),
      source: 'server',
    });
    expect(refreshSpy).toHaveBeenCalled();
  });
});
