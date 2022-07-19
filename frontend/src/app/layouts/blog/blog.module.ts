import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BlogRoutingModule } from './blog-routing.module';
import { BlogComponent } from './blog.component';
import { PostComponent } from './components/post/post.component';

@NgModule({
  declarations: [BlogComponent, PostComponent],
  imports: [CommonModule, BlogRoutingModule]
})
export class BlogModule {}
