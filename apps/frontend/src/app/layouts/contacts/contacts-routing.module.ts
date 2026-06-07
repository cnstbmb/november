import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ContactsComponent } from '@app/layouts/contacts/contacts.component';
import { Route } from '@shared/routes';

const routes: Routes = [
  {
    path: Route.root,
    component: ContactsComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ContactsRoutingModule {}
