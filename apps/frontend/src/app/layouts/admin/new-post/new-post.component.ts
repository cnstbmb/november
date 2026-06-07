import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { UntypedFormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService as BlogApi } from '@lib/blog/api.service';
import { MessageService, ToastMessageOptions } from 'primeng/api';

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
    hashtags: this.fb.control('')
  });

  private readonly destroy$ = new Subject<void>();

  ngOnDestroy(): void {
    this.destroy$.next();
  }

  constructor(
    private readonly fb: UntypedFormBuilder,
    private readonly api: BlogApi,
    private readonly messageService: MessageService
  ) {}

  submitPost(): void {
    const formValue = this.postForm.value;
    const hashtags = this.parseHashtags(formValue.hashtags);
    const payload = {
      ...formValue,
      hashtags
    };

    this.api
      .savePost(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe((response) => {
        let message: ToastMessageOptions = {};
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

  private parseHashtags(value: string | string[] | null | undefined): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
