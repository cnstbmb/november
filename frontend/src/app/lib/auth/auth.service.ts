import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthResult } from '@app/lib/auth/types';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { CookiesStorageService } from '@app/lib/storage/cookies-storage.service';

@Injectable()
export class AuthService {
  private readonly sessionIdTokenName = 'SESSIONID';

  constructor(private readonly http: HttpClient, private readonly storage: CookiesStorageService) {}

  login(email: string, password: string): Observable<AuthResult> {
    return this.http.post<AuthResult>('/api/login', { email, password }).pipe(shareReplay());
  }

  logout(): void {
    this.storage.removeItem(this.sessionIdTokenName);
  }

  public isLoggedIn(): boolean {
    return !!this.getIdToken();
  }

  isLoggedOut(): boolean {
    return !this.isLoggedIn();
  }

  getIdToken(): string | null {
    return this.storage.getItem(this.sessionIdTokenName);
  }
}
