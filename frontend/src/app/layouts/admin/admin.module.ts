import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TabMenuModule } from 'primeng/tabmenu';
import { AdminRoutingModule } from './admin-routing.module';
import { MenuComponent } from './menu/menu.component';
import { NewPostComponent } from './new-post/new-post.component';
import { MainComponent } from './main/main.component';
import { LinkShorterComponent } from './link-shorter/link-shorter.component';

@NgModule({
  declarations: [MenuComponent, NewPostComponent, MainComponent, LinkShorterComponent],
  imports: [CommonModule, AdminRoutingModule, TabMenuModule]
})
export class AdminModule {}
