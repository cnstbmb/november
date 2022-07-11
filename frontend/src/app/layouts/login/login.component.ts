import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-auth',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
  readonly authForm = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(3)])
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.authForm.valueChanges.subscribe(data => console.log(this.authForm.valid, data));
  }

  login(): void | undefined {
    const { email, password } = this.authForm.value;

    if (!email || !password) {
      return;
    }

    this.authService.login(email, password).subscribe(
      (data: { idToken: string; expiresIn: number }) => {
        console.log(data);
        console.log('User is logged in');
        this.router.navigateByUrl('/');
      },
      (error: { status: number }) => {
        console.log(error);
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
