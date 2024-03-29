import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';
import { MessageService } from 'primeng/api';
import { Route } from '@shared/routes';
import { AdminFragments } from '@app/shared/route/fragments';

@Component({
  selector: 'app-auth',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  readonly authForm = this.fb.group({
    login: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(3)])
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly messageService: MessageService
  ) {}

  login(): void | undefined {
    const { login, password } = this.authForm.value;

    if (!login || !password) {
      return;
    }

    this.authService.login(login, password).subscribe(
      () => {
        console.log('User is logged in');
        this.router.navigate([Route.admin], {
          fragment: AdminFragments.newPost
        });
      },
      (error: { status: number }) => {
        console.log({ error });
        if (error.status === 401) {
          return this.messageService.add({
            severity: 'error',
            summary: 'Auth error',
            detail: 'Неверный логин/пароль'
          });
        }

        this.messageService.add({
          severity: 'error',
          summary: 'Auth error'
        });
      }
    );
  }
}
