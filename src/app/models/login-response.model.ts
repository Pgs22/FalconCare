export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn?: number;
  user?: {
    id: number;
    email: string;
    roles: string[];
  };
}

