export interface AuthResult {
  idToken: string;
  expiresIn: number; // ms
}

export enum AuthLocalStorage {
  expires_at = '@expires_at',
  id_token = '@id_token'
}
