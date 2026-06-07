import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';

@Injectable()
export class AuthGuard {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): boolean | Promise<boolean> {
    const isAuthenticated = this.authService.isLoggedIn();
    if (!isAuthenticated) {
      this.router.navigate(['/login']);
    }
    return isAuthenticated;
  }
}
