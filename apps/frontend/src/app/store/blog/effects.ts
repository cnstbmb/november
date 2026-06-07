import { Injectable } from '@angular/core';
import { ApiService } from '@lib/blog/api.service';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { map, switchMap } from 'rxjs/operators';
import { EffectErrorHandler } from '../errors/handlers';
import {
  deletePost,
  deletePostError,
  deletePostSuccess,
  loadPosts,
  loadPostsError,
  loadPostsSuccess
} from './actions';

@Injectable()
export class BlogPostsEffects {
  loadPosts$ = createEffect(() => this.actions$.pipe(
    ofType(loadPosts),
    switchMap(({ filters }) => this.blogApi.getPosts(filters).pipe(
      map((response) => {
        if (typeof response === 'string') {
          return loadPostsError({
            error: new Error(response),
            message: response
          });
        }
        return loadPostsSuccess({ posts: response });
      })
    ))
  ));

  loadPostsError$ = createEffect(
    () => this.actions$.pipe(
      ofType(loadPostsError),
      map((error) => this.errorHandler.handle(error))
    ),
    { dispatch: false }
  );

  deletePost$ = createEffect(() => this.actions$.pipe(
    ofType(deletePost),
    switchMap(({ id }) => this.blogApi.deletePost(id).pipe(
      map((response) => {
        if (typeof response === 'string') {
          return deletePostError({
            error: new Error(response),
            message: response
          });
        }

        return deletePostSuccess({ id: response.id });
      })
    ))
  ));

  constructor(
    private actions$: Actions,
    private errorHandler: EffectErrorHandler,
    private blogApi: ApiService
  ) {}
}
