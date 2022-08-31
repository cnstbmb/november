import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InfiniteScrollModule } from 'ngx-infinite-scroll';
import { BlogRoutingModule } from './blog-routing.module';
import { BlogComponent } from './blog.component';
import { PostComponent } from './components/post/post.component';

@NgModule({
  declarations: [BlogComponent, PostComponent],
  imports: [CommonModule, BlogRoutingModule, InfiniteScrollModule]
})
export class BlogModule {}
