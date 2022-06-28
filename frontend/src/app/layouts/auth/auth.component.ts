import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@app/lib/auth/auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthComponent implements OnInit {
  readonly authForm = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(3)])
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.authForm.valueChanges.subscribe(data => console.log(this.authForm.valid, data));
  }

  login(): void | undefined {
    const { email, password } = this.authForm.value;

    if (!email || !password) {
      return;
    }

    this.authService.login(email, password).subscribe(() => {
      console.log('User is logged in');
      this.router.navigateByUrl('/');
    });
  }
}
