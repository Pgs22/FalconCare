/** JWT payload → nombre visible en paneles clínicos (doctor-panel, pacientes, etc.). */
export function parseJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token?.trim()) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalizedBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalizedBase64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function resolveClinicalUserDisplayName(
  payload: Record<string, unknown> | null,
  defaultUserLabel: string,
): string {
  if (!payload) {
    return defaultUserLabel;
  }

  const fullName =
    pickString(payload, ['name', 'fullName', 'full_name', 'displayName', 'display_name']) ??
    buildNameFromParts(payload);
  if (fullName) {
    return fullName;
  }

  const emailOrSub = pickString(payload, ['email', 'sub', 'username', 'preferred_username']);
  if (!emailOrSub) {
    return defaultUserLabel;
  }

  const emailPrefix = emailOrSub.includes('@') ? emailOrSub.split('@')[0] : emailOrSub;
  return toDisplayCase(emailPrefix.replace(/[._-]+/g, ' ').trim()) || defaultUserLabel;
}

function buildNameFromParts(payload: Record<string, unknown>): string | null {
  const firstName = pickString(payload, ['given_name', 'firstName', 'first_name']);
  const lastName = pickString(payload, ['family_name', 'lastName', 'last_name']);
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  return combined ? toDisplayCase(combined) : null;
}

function pickString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function toDisplayCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
