import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LetsCodeComponent } from '@app/layouts/lets-code/lets-code.component';
import { Route } from '@shared/routes';

const routes: Routes = [
  {
    path: Route.root,
    component: LetsCodeComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LetsCodeRoutingModule {}
