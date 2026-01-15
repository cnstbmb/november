import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthLocalStorage } from '@app/lib/auth/types';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const idToken = localStorage.getItem(AuthLocalStorage.id_token);

    if (!idToken) {
      return next.handle(req);
    }

    const cloned = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${idToken}`)
    });

    return next.handle(cloned);
  }
}
