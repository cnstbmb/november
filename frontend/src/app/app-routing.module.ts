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
  { path: Route.notMatch, component: PageNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: [AuthGuard]
})
export class AppRoutingModule {}
