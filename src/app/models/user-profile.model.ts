export type ApiUser = {
  id: number;
  email: string;
  roles: string[];
  fullName?: string;
  profile_image?: string | null;
  profile_image_url?: string | null;
  profileImageUrl?: string | null;
};

export type UserProfile = {
  id: number;
  email: string;
  roles: string[];
  fullName?: string;
  profileImageUrl: string | null;
};

export function normalizeUserProfile(apiUser: ApiUser): UserProfile {
  return {
    id: apiUser.id,
    email: apiUser.email,
    roles: apiUser.roles ?? [],
    fullName: apiUser.fullName,
    profileImageUrl:
      toNonEmptyString(apiUser.profile_image) ??
      toNonEmptyString(apiUser.profile_image_url) ??
      toNonEmptyString(apiUser.profileImageUrl) ??
      null,
  };
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
