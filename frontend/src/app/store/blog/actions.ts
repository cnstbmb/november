import { BlogPost } from '@app/shared/blog/types';
import { createAction, props } from '@ngrx/store';
import { LazyLoadEvent } from 'primeng/api';
import { ErrorHandlerParams } from '../types';

function actionType(type: string) {
  return `[BLOG] ${type}`;
}

export const loadPosts = createAction(
  actionType('load posts'),
  props<{ filters: LazyLoadEvent }>()
);

export const loadPostsSuccess = createAction(
  actionType('post loaded success'),
  props<{ posts: BlogPost[] }>()
);

export const loadPostsError = createAction(
  actionType('error while loading posts'),
  props<ErrorHandlerParams>()
);

export const deletePost = createAction(actionType('delete blog post'), props<{ id: string }>());

export const deletePostSuccess = createAction(
  actionType('blog post delete successful'),
  props<{ id: string }>()
);

export const deletePostError = createAction(
  actionType('error while deleting post'),
  props<ErrorHandlerParams>()
);
