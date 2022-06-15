import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Route } from '@shared/routes';
import { PageNotFoundComponent } from '@app/layouts/page-not-found/page-not-found.component';

const routes: Routes = [
  { path: Route.root, redirectTo: Route.contacts, pathMatch: 'full' },
  {
    path: Route.contacts,
    loadChildren: () => import('./layouts/contacts/contacts.module').then(m => m.ContactsModule)
  },
  { path: Route.notMatch, component: PageNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
