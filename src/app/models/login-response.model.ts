/**
 * Contrato `AuthController` Symfony (JWT).
 * Puede serializarse en camelCase o con snake_case según grupos/normalizer.
 */
export interface LoginResponse {
  accessToken?: string;
  access_token?: string;
  tokenType?: 'Bearer';
  token_type?: string;
  expiresIn?: number;
  expires_in?: number;
  user?: {
    id: number;
    email: string;
    roles: string[];
    fullName?: string;
    profileImageUrl?: string | null;
    profile_image_url?: string | null;
    profile_image?: string | null;
  };
}

