import { Component, ChangeDetectionStrategy } from '@angular/core';
import { BlogPost } from '@app/shared/blog/types';
import { deletePost, loadPosts } from '@app/store/blog/actions';
import { selectBlogPosts } from '@app/store/blog/selectors';
import { BlogPostsState } from '@app/store/blog/state';
import { AuthService } from '@lib/auth/auth.service';
import { Store } from '@ngrx/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-blog',
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogComponent {
  private rows = 10;

  private offset!: number;

  readonly posts$: Observable<BlogPost[]>;

  constructor(
    private store: Store<BlogPostsState>,
    private authService: AuthService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {
    this.loadMorePosts();
    this.posts$ = this.store.select(selectBlogPosts);
  }

  onScrollDown(): void {
    this.loadMorePosts();
  }

  onScrollUp(): void {
    // this.offset = 0;
    // this.posts = [];
    // this.loadPosts();
  }

  onDeletePost(post: BlogPost) {
    if (this.authService.isLoggedOut()) {
      console.log('dong dong dong');
      return;
    }

    this.confirmationService.confirm({
      message: `Are you sure that you want to delete "${post.title}"?`,
      header: 'Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.messageService.add({
          severity: 'info',
          summary: 'Removed',
          detail: `Post ${post.title} was deleted`
        });
        this.deletePost(post);
      },
      reject: () => this.messageService.add({ severity: 'warn', summary: 'Cancelled' })
    });
  }

  private loadMorePosts(): void {
    if (this.offset >= 0) {
      this.offset += this.rows;
    } else {
      this.offset = 0;
    }
    this.loadPosts();
  }

  private loadPosts(): void {
    this.store.dispatch(loadPosts({ filters: { rows: this.rows, first: this.offset } }));
  }

  private deletePost(post: BlogPost): void {
    this.store.dispatch(deletePost({ id: post.id }));
    this.loadPosts();
  }
}
