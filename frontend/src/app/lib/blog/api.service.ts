import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BlogPostData } from '@app/shared/blog/types';
import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

@Injectable()
export class ApiService {
  private readonly url = '/api/blog';

  constructor(private readonly http: HttpClient) {}

  savePost(params: BlogPostData): Observable<{ id: string } | string> {
    return this.http
      .post<{ id: string }>(this.url, params)
      .pipe(shareReplay(), catchError(this.handleError));
  }

  async getPosts(params: unknown): Promise<void> {
    console.log('get', this.url, params);
  }

  async deletePost(params: unknown): Promise<void> {
    console.log('delete', this.url, params);
  }

  private handleError(error: any): Observable<string> {
    console.log('========================');
    console.log(error);
    console.log('========================');
    let errorMessage = '';
    if (error.error instanceof ErrorEvent) {
      // client-side error
      errorMessage = error.error.message;
    } else {
      // server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    console.log(errorMessage);
    return throwError(() => {
      return errorMessage;
    });
  }
}
