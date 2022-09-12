import { BlogPost } from '@app/shared/blog/types';
import { createEntityAdapter, EntityState } from '@ngrx/entity';

export const blogFeatureKey = 'blog';

export const blogPostsAdapter = createEntityAdapter<BlogPost>();

export interface BlogPostsState {
  posts: EntityState<BlogPost>;
}

export const BlogPostsInitialState: BlogPostsState = {
  posts: blogPostsAdapter.getInitialState()
};
