import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type PathologyTypeItem = {
  id: number;
  name: string;
  defaultDuration: number;
};

@Injectable({ providedIn: 'root' })
export class PathologyTypeService {
  private readonly pathologyTypesUrl = `${environment.apiBaseUrl}/api/pathologies/types`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<PathologyTypeItem[]> {
    return this.http.get<PathologyTypeItem[]>(this.pathologyTypesUrl);
  }
}
