import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiUser, UserProfile, normalizeUserProfile } from '../models/user-profile.model';

export type AppUser = UserProfile;

export type UpdateUserPayload = {
  email?: string;
  plainPassword?: string;
  profile_image?: string | null;
};

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/users`;

  constructor(private readonly http: HttpClient) {}

  listUsers(): Observable<AppUser[]> {
    return this.http
      .get<ApiUser[]>(this.baseUrl)
      .pipe(map((users) => users.map((user) => normalizeUserProfile(user))));
  }

  getById(userId: number): Observable<UserProfile> {
    return this.http.get<ApiUser>(`${this.baseUrl}/${userId}`).pipe(map((user) => normalizeUserProfile(user)));
  }

  getUserById(userId: number): Observable<AppUser> {
    return this.getById(userId);
  }

  /** Persiste en Neon vía Symfony: columna `profile_image` de `user` (data URL o `null` para borrar). */
  updateProfileImage(userId: number, profileImage: string | null): Observable<UserProfile> {
    return this.http
      .put<ApiUser>(`${this.baseUrl}/${userId}`, { profile_image: profileImage })
      .pipe(map((user) => normalizeUserProfile(user)));
  }

  updateUser(userId: number, payload: UpdateUserPayload): Observable<AppUser> {
    return this.http
      .put<ApiUser>(`${this.baseUrl}/${userId}`, payload)
      .pipe(map((user) => normalizeUserProfile(user)));
  }
}

