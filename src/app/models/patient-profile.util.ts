/**
 * Prioridad backend (GET/PUT): profile_image → profile_image_url → profileImage
 * (mismo valor en las tres claves en respuestas Symfony).
 */
export function normalizePatientProfileImage(raw: Record<string, unknown>): string | null {
  const v =
    raw['profile_image'] ?? raw['profile_image_url'] ?? raw['profileImage'] ?? raw['profileImageUrl'];
  if (typeof v !== 'string') {
    return null;
  }
  const t = v.trim();
  return t.length > 0 ? t : null;
}
