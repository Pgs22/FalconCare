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
});
