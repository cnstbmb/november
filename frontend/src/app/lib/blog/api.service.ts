import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BlogPost, BlogPostData } from '@app/shared/blog/types';
import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { LazyLoadEvent } from 'primeng/api';

@Injectable()
export class ApiService {
  private readonly url = '/api/blog';

  constructor(private readonly http: HttpClient) {}

  savePost(params: BlogPostData): Observable<{ id: string } | string> {
    return this.http
      .post<{ id: string }>(this.url, params)
      .pipe(shareReplay(), catchError(this.handleError));
  }

  getPosts(params: LazyLoadEvent): Observable<BlogPost[] | string> {
    const { first, rows } = params;
    let queryParams = new HttpParams();
    if (typeof first === 'number' && first >= 0) {
      queryParams = queryParams.append('first', first);
    }

    if (rows) {
      queryParams = queryParams.append('rows', rows);
    }

    return this.http
      .get<BlogPost[]>(this.url, { params: queryParams })
      .pipe(shareReplay(), catchError(this.handleError));
  }

  deletePost(postId: string): Observable<{ id: string } | string> {
    const url = `${this.url}/${postId}`;
    return this.http.delete<{ id: string }>(url).pipe(shareReplay(), catchError(this.handleError));
  }

  private handleError(error: any): Observable<string> {
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
