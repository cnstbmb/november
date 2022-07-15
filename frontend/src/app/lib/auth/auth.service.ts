import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthLocalStorage, AuthResult } from '@app/lib/auth/types';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import * as moment from 'moment';
import { apiUrl } from '@shared/api-url';

@Injectable()
export class AuthService {
  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Observable<AuthResult> {
    return this.http.post<AuthResult>('/api/login', { email, password }).pipe(shareReplay());
  }

  logout(): void {
    localStorage.removeItem(AuthLocalStorage.id_token);
    localStorage.removeItem(AuthLocalStorage.expires_at);
  }

  public isLoggedIn(): boolean {
    return !!(this.getIdToken() && moment().isBefore(this.getExpiration()));
  }

  isLoggedOut(): boolean {
    return !this.isLoggedIn();
  }

  getExpiration(): moment.Moment | undefined {
    const expiration = localStorage.getItem(AuthLocalStorage.expires_at);
    if (!expiration) {
      return;
    }

    const expiresAt = JSON.parse(expiration);
    return moment(expiresAt);
  }

  getIdToken(): string | null {
    return localStorage.getItem(AuthLocalStorage.id_token);
  }

  private setSession(authResult: AuthResult): void {
    const expiresAt = moment().add(authResult.expiresIn);

    localStorage.setItem(AuthLocalStorage.id_token, authResult.idToken);
    localStorage.setItem(AuthLocalStorage.expires_at, JSON.stringify(expiresAt.valueOf()));
  }
}
