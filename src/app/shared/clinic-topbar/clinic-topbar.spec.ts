import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ClinicTopbarComponent } from './clinic-topbar';

describe('ClinicTopbarComponent', () => {
  let fixture: ComponentFixture<ClinicTopbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClinicTopbarComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ClinicTopbarComponent);
    fixture.detectChanges();
  });

  it('should render primary navigation links', () => {
    const links = fixture.nativeElement.querySelectorAll('nav a');
    expect(links.length).toBe(4);
    expect(links[0].getAttribute('href')).toContain('/doctor-panel');
    expect(links[1].getAttribute('href')).toContain('/appointments');
    expect(links[2].getAttribute('href')).toContain('/documents');
    expect(links[3].getAttribute('href')).toContain('/settings');
  });

  it('should expose accessible navigation landmark', () => {
    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBeTruthy();
  });
});
