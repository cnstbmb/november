import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService as BlogApi } from '@lib/blog/api.service';
import { Message, MessageService } from 'primeng/api';

@Component({
  selector: 'app-new-post',
  templateUrl: './new-post.component.html',
  styleUrls: ['./new-post.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewPostComponent implements OnDestroy {
  readonly postForm = this.fb.group({
    content: this.fb.control('', [Validators.required]),
    title: this.fb.control('', [Validators.required]),
    hashtags: this.fb.control([])
  });

  private readonly destroy$ = new Subject<void>();

  ngOnDestroy(): void {
    this.destroy$.next();
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly api: BlogApi,
    private readonly messageService: MessageService
  ) {}

  submitPost(): void {
    this.api
      .savePost(this.postForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe(response => {
        let message: Message = {};
        console.log(response);
        if (!response || typeof response !== 'object' || !response.id) {
          message = {
            severity: 'error',
            summary: 'Ошибка при создании поста',
            detail: JSON.stringify(response)
          };
        } else {
          message = {
            severity: 'success',
            summary: 'Пост создан',
            detail: `Пост создан. id=${response.id}`
          };

          this.postForm.reset();
        }

        this.messageService.add(message);
      });
  }

  postContentChanged() {
    // Костыль, для срабатывания обновления формы.
  }
}
