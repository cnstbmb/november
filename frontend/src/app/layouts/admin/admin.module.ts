import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PanelMenuModule } from 'primeng/panelmenu';
import { AdminRoutingModule } from './admin-routing.module';
import { MenuComponent } from './menu/menu.component';
import { NewPostComponent } from './new-post/new-post.component';
import { NewUserComponent } from './new-user/new-user.component';
import { MainComponent } from './main/main.component';
import { LinkShorterComponent } from './link-shorter/link-shorter.component';

@NgModule({
  declarations: [
    MenuComponent,
    NewPostComponent,
    NewUserComponent,
    MainComponent,
    LinkShorterComponent
  ],
  imports: [CommonModule, AdminRoutingModule, PanelMenuModule]
})
export class AdminModule {}
