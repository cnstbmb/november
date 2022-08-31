import { Component, ChangeDetectionStrategy } from '@angular/core';
import { BlogPost } from '@app/shared/blog/types';
import { ApiService } from '@lib/blog/api.service';
import { LazyLoadEvent } from 'primeng/api';
import { BehaviorSubject, Observable } from 'rxjs';
import { switchMap, map, debounceTime, scan } from 'rxjs/operators';

@Component({
  selector: 'app-blog',
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogComponent {
  private rows = 3;

  private offset = 0;

  readonly posts$: Observable<BlogPost[]>;

  private readonly loadPosts$ = new BehaviorSubject<LazyLoadEvent>({
    first: 0,
    rows: this.rows
  });

  constructor(private readonly api: ApiService) {
    this.posts$ = this.loadPosts$.pipe(
      debounceTime(500),
      switchMap(event => this.api.getPosts(event)),
      map(response => {
        console.log(response);
        if (typeof response === 'string') {
          console.error(response);
          return [];
        }

        return response;
      }),
      scan((acc, value) => [...acc, ...value])
    );
  }

  loadPosts(): void {
    this.offset += this.rows;
    this.loadPosts$.next({ rows: this.rows, first: this.offset });
  }

  onScrollDown(): void {
    this.loadPosts();
  }

  onScrollUp(): void {
    // this.offset = 0;
    // this.posts = [];
    // this.loadPosts();
  }
}
