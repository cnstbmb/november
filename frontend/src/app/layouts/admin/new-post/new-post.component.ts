import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-new-post',
  templateUrl: './new-post.component.html',
  styleUrls: ['./new-post.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewPostComponent {}
