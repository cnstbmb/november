import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | Promise<boolean> {
    console.log({
      route,
      state
    });
    const isAuthenticated = this.authService.isLoggedIn();
    if (!isAuthenticated) {
      this.router.navigate(['/login']);
    }
    return isAuthenticated;
  }
}
