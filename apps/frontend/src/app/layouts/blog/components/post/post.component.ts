import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter
} from '@angular/core';
import { BlogPostFullData } from '@app/shared/blog/types';
import { AuthService } from '@lib/auth/auth.service';

@Component({
  selector: 'app-post',
  templateUrl: './post.component.html',
  styleUrls: ['./post.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PostComponent {
  @Input()
    postData!: BlogPostFullData;

  @Output()
    deletePost = new EventEmitter();

  mouseOvered: boolean = false;

  readonly isAuthenticated: boolean;

  constructor(private authService: AuthService) {
    this.isAuthenticated = this.authService.isLoggedIn();
  }

  delete() {
    if (!this.isAuthenticated) {
      return;
    }

    this.deletePost.emit();
  }
}
