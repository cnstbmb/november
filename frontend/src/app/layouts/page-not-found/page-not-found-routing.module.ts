import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@app/shared/routes';
import { PageNotFoundComponent } from './page-not-found.component';

const routes: Routes = [
  {
    path: Route.root,
    component: PageNotFoundComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PageNotFoundRoutingModule {}
