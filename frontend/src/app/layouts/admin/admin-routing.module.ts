import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { MainComponent } from '@app/layouts/admin/main/main.component';
import { AuthGuard } from '@app/lib/auth/auth-guard';

const routes: Routes = [
  {
    path: Route.root,
    canActivate: [AuthGuard],
    component: MainComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
