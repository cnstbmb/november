import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { PageNotFoundComponent } from '@app/layouts/page-not-found/page-not-found.component';
import { AuthGuard } from '@app/lib/auth/auth-guard';

const routes: Routes = [
  { path: Route.root, redirectTo: Route.contacts, pathMatch: 'full' },
  {
    path: Route.contacts,
    loadChildren: () => import('./layouts/contacts/contacts.module').then(m => m.ContactsModule)
  },
  {
    path: Route.letscode,
    canActivate: [AuthGuard],
    loadChildren: () => import('./layouts/lets-code/lets-code.module').then(m => m.LetsCodeModule)
  },
  {
    path: Route.login,
    loadChildren: () => import('./layouts/login/login.module').then(m => m.LoginModule)
  },
  {
    path: Route.admin,
    canActivate: [AuthGuard],
    loadChildren: () => import('./layouts/admin/admin.module').then(m => m.AdminModule)
  },
  {
    path: Route.blog,
    loadChildren: () => import('./layouts/blog/blog.module').then(m => m.BlogModule)
  },
  { path: Route.notMatch, component: PageNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: [AuthGuard]
})
export class AppRoutingModule {}
