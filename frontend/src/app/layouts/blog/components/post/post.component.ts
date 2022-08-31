import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { BlogPostFullData } from '@app/shared/blog/types';

@Component({
  selector: 'app-post',
  templateUrl: './post.component.html',
  styleUrls: ['./post.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PostComponent {
  @Input()
  postData!: BlogPostFullData;

  mouseOvered: boolean = false;
}
