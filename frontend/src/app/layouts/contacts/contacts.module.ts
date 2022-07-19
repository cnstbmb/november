import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CanvasBackgroundModule } from '@app/canvas-background/canvas-background.module';
import { ContactsRoutingModule } from './contacts-routing.module';
import { ContactsComponent } from './contacts.component';

@NgModule({
  declarations: [ContactsComponent],
  imports: [CommonModule, ContactsRoutingModule, CanvasBackgroundModule]
})
export class ContactsModule {}
