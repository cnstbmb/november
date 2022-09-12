import { routerReducer, RouterReducerState } from '@ngrx/router-store';
import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { BlogPostsEffects } from './blog/effects';
import { blogPostsReducers } from './blog/reducers';
import { blogFeatureKey, BlogPostsState } from './blog/state';

export interface State {
  router: RouterReducerState;
  [blogFeatureKey]: BlogPostsState;
}

export const reducers: ActionReducerMap<State> = {
  router: routerReducer,
  [blogFeatureKey]: blogPostsReducers
};

export const effects = [BlogPostsEffects];

export const metaReducers: MetaReducer<State>[] = [];
