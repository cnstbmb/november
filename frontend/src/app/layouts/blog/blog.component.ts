import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-blog',
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogComponent {}
