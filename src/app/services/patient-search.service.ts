import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  of,
  switchMap,
} from 'rxjs';

import { Patient } from '../models/patient.model';
import { PatientService } from './patient.service';

/**
 * Búsqueda de pacientes (misma lógica que el doctor-panel):
 * ID numérico → GET por id; texto → ?search=; fallback listado + filtro local.
 */
@Injectable({ providedIn: 'root' })
export class PatientSearchService {
  constructor(
    private readonly patientService: PatientService,
    private readonly translate: TranslateService,
  ) {}

  search(term: string): Observable<Patient[]> {
    const trimmed = term.trim();
    if (!trimmed) {
      return of([]);
    }

    const idNum = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
    const validId = Number.isFinite(idNum) && idNum >= 1;

    const byId$ = validId
      ? this.patientService.getById(idNum).pipe(
          map((p) => [p] as Patient[]),
          catchError(() => of([] as Patient[])),
        )
      : of([] as Patient[]);

    const bySearch$ = this.patientService.list(trimmed).pipe(catchError(() => of([] as Patient[])));
    const byLocalFallback$ = this.patientService.list().pipe(
      map((patients) => this.filterLocally(patients, trimmed)),
      catchError(() => of([] as Patient[])),
    );

    if (validId) {
      return byId$.pipe(
        switchMap((byId) =>
          bySearch$.pipe(
            switchMap((bySearch) => {
              const merged = this.mergeUnique(byId, bySearch);
              return merged.length > 0
                ? of(merged)
                : byLocalFallback$.pipe(map((local) => this.mergeUnique(byId, local)));
            }),
          ),
        ),
      );
    }

    return bySearch$.pipe(
      switchMap((bySearch) => (bySearch.length > 0 ? of(bySearch) : byLocalFallback$)),
    );
  }

  /**
   * Mismo pipeline que doctor-panel: debounce 350 ms, término vacío → [], si no `search()` contra la API.
   */
  wireDebouncedSearch(
    input$: Subject<string>,
    hooks: { onLoadingChange: (loading: boolean) => void },
  ): Observable<Patient[]> {
    return input$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap((raw) => {
        const term = raw.trim();
        if (!term) {
          hooks.onLoadingChange(false);
          return of([] as Patient[]);
        }
        hooks.onLoadingChange(true);
        return this.search(term).pipe(
          map((patients) => this.sortByDisplayName(patients)),
          finalize(() => hooks.onLoadingChange(false)),
          catchError(() => of([] as Patient[])),
        );
      }),
    );
  }

  sortByDisplayName(patients: Patient[]): Patient[] {
    return [...patients].sort((a, b) =>
      this.displayName(a).localeCompare(this.displayName(b), undefined, { sensitivity: 'base' }),
    );
  }

  displayName(p: Patient): string {
    const fn = p.firstName?.trim() ?? '';
    const ln = p.lastName?.trim() ?? '';
    const name = [fn, ln].filter(Boolean).join(' ').trim();
    if (name) {
      return name;
    }
    if (p.id != null) {
      return this.translate.instant('doctorPanel.search.patientWithId', { id: p.id });
    }
    return this.translate.instant('doctorPanel.defaults.patient');
  }

  private filterLocally(patients: Patient[], term: string): Patient[] {
    const normalizedTerm = this.normalizeText(term);
    if (!normalizedTerm) {
      return [];
    }
    return patients.filter((p) => {
      const idText = String(p.id ?? '');
      const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
      const normalizedName = this.normalizeText(fullName);
      return idText.includes(term) || normalizedName.includes(normalizedTerm);
    });
  }

  private mergeUnique(...groups: Patient[][]): Patient[] {
    const seen = new Set<number>();
    const merged: Patient[] = [];
    for (const group of groups) {
      for (const patient of group) {
        const id = patient.id;
        if (id == null || seen.has(id)) {
          continue;
        }
        seen.add(id);
        merged.push(patient);
      }
    }
    return merged;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
