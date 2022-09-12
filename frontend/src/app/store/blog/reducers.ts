import { Action, createReducer, on } from '@ngrx/store';
import { deletePostSuccess, loadPostsSuccess } from './actions';
import { blogPostsAdapter, BlogPostsInitialState, BlogPostsState } from './state';

const reducers = createReducer(
  BlogPostsInitialState,
  on(loadPostsSuccess, (state, { posts }) => ({
    ...state,
    posts: blogPostsAdapter.upsertMany(posts, state.posts)
  })),
  on(deletePostSuccess, (state, { id }) => ({
    ...state,
    posts: blogPostsAdapter.removeOne(id, state.posts)
  }))
);

export function blogPostsReducers(state: BlogPostsState | undefined, action: Action) {
  return reducers(state, action);
}
