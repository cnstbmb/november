import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/lib/auth/auth.service';

@NgModule({
  declarations: [],
  imports: [CommonModule],
  providers: [AuthService]
})
export class AuthModule {}
