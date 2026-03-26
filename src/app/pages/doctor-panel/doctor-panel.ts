import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-doctor-panel',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './doctor-panel.html',
  styleUrl: './doctor-panel.css',
})
export class DoctorPanelComponent implements OnInit, OnDestroy {
  readonly defaultAvatarUrl = '/assets/branding/doctor-avatar-icon.png';
  profileImageUrl = this.defaultAvatarUrl;
  doctorDisplayName = 'Usuario';
  doctorSpecialty = 'Especialista';
  timeGreeting = 'Buenos días';
  timeGreetingIcon = 'wb_sunny';
  activeNavItem: 'dashboard' | 'agenda' | 'pacientes' | 'inventario' | 'configuracion' = 'dashboard';
  private greetingTimer: ReturnType<typeof setInterval> | null = null;

  private jwtPayload: Record<string, unknown> | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.refreshJwtPayload();
    this.doctorDisplayName = this.getDoctorDisplayNameFromPayload(this.jwtPayload);
    this.loadSavedProfileImage();
    this.updateTimeGreeting();
  }

  ngOnInit(): void {
    // Keep greeting synced with the device local time.
    this.greetingTimer = setInterval(() => this.updateTimeGreeting(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.greetingTimer) {
      clearInterval(this.greetingTimer);
      this.greetingTimer = null;
    }
  }

  onProfileFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      input.value = '';
      return;
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        return;
      }

      try {
        localStorage.setItem(this.getProfileStorageKey(), result);
        this.profileImageUrl = result;
      } catch {
        // If storage is full/blocked, keep current image without breaking UI.
      } finally {
        input.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  setActiveNavItem(
    item: 'dashboard' | 'agenda' | 'pacientes' | 'inventario' | 'configuracion'
  ): void {
    this.activeNavItem = item;
  }

  goToSettings(event: Event): void {
    event.preventDefault();
    this.activeNavItem = 'configuracion';
    this.router.navigateByUrl('/settings');
  }

  private loadSavedProfileImage(): void {
    try {
      const saved = localStorage.getItem(this.getProfileStorageKey());
      if (saved) {
        this.profileImageUrl = saved;
      }
    } catch {
      this.profileImageUrl = this.defaultAvatarUrl;
    }
  }

  private getProfileStorageKey(): string {
    const doctorIdentifier = this.getDoctorIdentifierFromPayload(this.jwtPayload);
    return `falconcare_doctor_profile_image_${doctorIdentifier}`;
  }

  private getDoctorIdentifierFromPayload(payload: Record<string, unknown> | null): string {
    if (!payload) {
      return 'anonymous';
    }

    const identifier = payload?.['email'] ?? payload?.['username'] ?? payload?.['sub'];
    if (!identifier || typeof identifier !== 'string') {
      return 'anonymous';
    }

    return identifier.toLowerCase().trim();
  }

  private refreshJwtPayload(): void {
    this.jwtPayload = this.parseJwtPayload(this.authService.getToken() ?? '');
  }

  private getDoctorDisplayNameFromPayload(payload: Record<string, unknown> | null): string {
    if (!payload) {
      return 'Usuario';
    }

    const fullName =
      this.getStringValue(payload, ['name', 'fullName', 'full_name', 'displayName', 'display_name']) ??
      this.buildNameFromParts(payload);
    if (fullName) {
      return fullName;
    }

    const emailOrSub = this.getStringValue(payload, ['email', 'sub', 'username', 'preferred_username']);
    if (!emailOrSub) {
      return 'Usuario';
    }

    const emailPrefix = emailOrSub.includes('@') ? emailOrSub.split('@')[0] : emailOrSub;
    return this.toDisplayCase(emailPrefix.replace(/[._-]+/g, ' ').trim()) || 'Usuario';
  }

  private buildNameFromParts(payload: Record<string, unknown>): string | null {
    const firstName = this.getStringValue(payload, ['given_name', 'firstName', 'first_name']);
    const lastName = this.getStringValue(payload, ['family_name', 'lastName', 'last_name']);
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    return combined ? this.toDisplayCase(combined) : null;
  }

  private getStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private toDisplayCase(value: string): string {
    return value
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private updateTimeGreeting(): void {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      this.timeGreeting = 'Buenos días';
      this.timeGreetingIcon = 'wb_sunny';
      return;
    }
    if (hour >= 12 && hour < 20) {
      this.timeGreeting = 'Buenas tardes';
      this.timeGreetingIcon = 'wb_sunny';
      return;
    }
    this.timeGreeting = 'Buenas noches';
    this.timeGreetingIcon = 'bedtime';
  }

  private parseJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const normalizedBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalizedBase64);
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
