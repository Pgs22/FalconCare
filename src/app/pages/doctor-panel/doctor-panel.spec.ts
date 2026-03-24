import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { DoctorPanelComponent } from './doctor-panel';

describe('DoctorPanelComponent', () => {
  let fixture: ComponentFixture<DoctorPanelComponent>;
  let component: DoctorPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorPanelComponent],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
