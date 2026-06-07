import { createFeatureSelector, createSelector } from '@ngrx/store';

import { BlogPostsState, blogPostsAdapter, blogFeatureKey } from './state';

const { selectAll } = blogPostsAdapter.getSelectors();

const selectBlogPostsState = createFeatureSelector<any, BlogPostsState>(blogFeatureKey);

export const selectBlogPosts = createSelector(selectBlogPostsState, (state) => selectAll(state.posts));
