import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { BlogComponent } from '@app/layouts/blog/blog.component';

const routes: Routes = [{ path: Route.root, component: BlogComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BlogRoutingModule {}
