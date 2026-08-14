import { createFeatureSelector, createSelector } from '@ngrx/store';

import { homeFeatureKey } from './home.reducer';
import type { HomeState } from './home.state';

const selectHomeState = createFeatureSelector<HomeState>(homeFeatureKey);

export const selectHomeSections = createSelector(selectHomeState, (state) => state.sections);

export const selectHomeSectionsLoading = createSelector(selectHomeState, (state) => state.loading);

export const selectHomeSectionsError = createSelector(selectHomeState, (state) => state.error);

/** The whole hero map "nearby toys" slice — see `HomeNearbyState`'s own doc
 *  comment. A single selector (rather than one per field) keeps
 *  `HomePageComponent`'s `viewModel$` combineLatest to one extra entry, and
 *  keeps every mock-store test that wires this component to one extra
 *  registration. */
export const selectHomeNearby = createSelector(selectHomeState, (state) => state.nearby);
