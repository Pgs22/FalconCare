import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AppUser = {
  id: number;
  email: string;
  roles: string[];
};

export type UpdateUserPayload = {
  email?: string;
  plainPassword?: string;
};

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/users`;

  constructor(private readonly http: HttpClient) {}

  listUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(this.baseUrl);
  }

  updateUser(userId: number, payload: UpdateUserPayload): Observable<AppUser> {
    return this.http.put<AppUser>(`${this.baseUrl}/${userId}`, payload);
  }
}

