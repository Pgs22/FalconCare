import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ClinicPageShellComponent } from './clinic-page-shell';

describe('ClinicPageShellComponent', () => {
  let fixture: ComponentFixture<ClinicPageShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClinicPageShellComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ClinicPageShellComponent);
    fixture.detectChanges();
  });

  it('should render shared topbar inside main shell', () => {
    const shell = fixture.nativeElement.querySelector('main.clinic-page-shell');
    const topbar = fixture.nativeElement.querySelector('app-clinic-topbar');
    expect(shell).withContext('shell main landmark').toBeTruthy();
    expect(topbar).withContext('shared navbar').toBeTruthy();
  });
});
