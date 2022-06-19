import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { AuthComponent } from '@app/layouts/auth/auth.component';

const routes: Routes = [
  {
    path: Route.root,
    component: AuthComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule {}
