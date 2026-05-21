import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';

import { PROFILE_IMAGE_DEFAULT_URL } from '../../constants/profile-image-upload-feedback';
import { Patient } from '../../models/patient.model';
import { AuthService } from '../../services/auth.service';
import { PatientSearchService } from '../../services/patient-search.service';
import { parseJwtPayload, resolveClinicalUserDisplayName } from '../../utils/clinical-user-display.util';

@Component({
  standalone: true,
  selector: 'app-patients-page',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './patients.page.html',
  styleUrls: ['./patients.page.css', '../doctor-panel/doctor-panel.css'],
})
export class PatientsPageComponent implements OnInit, OnDestroy {
  readonly profileImageUrl = PROFILE_IMAGE_DEFAULT_URL;
  doctorDisplayName = '';
  doctorSpecialty = '';
  searchQuery = '';
  patientSearchResults: Patient[] = [];
  searchPatientsLoading = false;
  searchDropdownOpen = false;

  private readonly patientSearchInput$ = new Subject<string>();
  private patientSearchSub: Subscription | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly patientSearch: PatientSearchService,
    private readonly translate: TranslateService,
  ) {
    const defaultUser = this.translate.instant('doctorPanel.defaults.user');
    this.doctorDisplayName = resolveClinicalUserDisplayName(
      parseJwtPayload(this.authService.getToken()),
      defaultUser,
    );
    this.doctorSpecialty = this.translate.instant('doctorPanel.defaults.professional');
  }

  ngOnInit(): void {
    this.patientSearchSub = this.patientSearch
      .wireDebouncedSearch(this.patientSearchInput$, {
        onLoadingChange: (loading) => {
          this.searchPatientsLoading = loading;
        },
      })
      .subscribe((patients) => {
        this.patientSearchResults = patients;
      });
  }

  ngOnDestroy(): void {
    this.patientSearchSub?.unsubscribe();
  }

  onPatientSearchChange(value: string): void {
    this.patientSearchInput$.next(value);
  }

  onPatientSearchFocus(): void {
    this.searchDropdownOpen = true;
  }

  onPatientSearchBlur(): void {
    setTimeout(() => {
      this.searchDropdownOpen = false;
    }, 200);
  }

  onPatientSearchEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') {
      return;
    }
    keyboardEvent.preventDefault();
    const term = this.searchQuery.trim();
    if (!term || this.searchPatientsLoading) {
      return;
    }
    if (this.patientSearchResults.length !== 1) {
      return;
    }
    this.openPatient(this.patientSearchResults[0]);
  }

  patientDisplayName(p: Patient): string {
    return this.patientSearch.displayName(p);
  }

  openPatient(p: Patient): void {
    if (p.id == null) {
      return;
    }
    this.searchQuery = '';
    this.patientSearchResults = [];
    this.searchDropdownOpen = false;
    this.patientSearchInput$.next('');
    void this.router.navigate(['/patient-panel', p.id]);
  }

  onLogout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  get hasActiveSearch(): boolean {
    return this.searchQuery.trim().length > 0;
  }

}
