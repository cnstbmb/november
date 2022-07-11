import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { LoginComponent } from '@app/layouts/login/login.component';

const routes: Routes = [
  {
    path: Route.root,
    component: LoginComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LoginRoutingModule {}
