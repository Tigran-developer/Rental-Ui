import { createReducer, on } from '@ngrx/store';

import { YEREVAN_CENTER } from '../../listings/components/location-picker/location-picker.component';
import * as ListingsActions from '../../listings/store/listings.actions';
import { HomeNearbyActions, HomeSectionsActions } from './home.actions';
import { initialHomeState, type HomeState } from './home.state';

export const homeFeatureKey = 'home';

function toggleIsFavoriteInSections(
  sections: HomeState['sections'],
  listingId: string,
  isFavorite: boolean | 'flip',
) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.id === listingId
        ? { ...item, isFavorite: isFavorite === 'flip' ? !item.isFavorite : isFavorite }
        : item,
    ),
  }));
}

export const homeReducer = createReducer<HomeState>(
  initialHomeState,
  on(HomeSectionsActions.load, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(HomeSectionsActions.loadSuccess, (state, { sections }) => ({
    ...state,
    sections,
    loading: false,
    error: null,
  })),
  on(HomeSectionsActions.loadFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ListingsActions.toggleFavoriteOptimistic, (state, { listingId }) => ({
    ...state,
    sections: toggleIsFavoriteInSections(state.sections, listingId, 'flip'),
  })),
  on(ListingsActions.toggleFavoriteRollback, (state, { listingId, isFavorite }) => ({
    ...state,
    sections: toggleIsFavoriteInSections(state.sections, listingId, isFavorite),
  })),
  on(HomeNearbyActions.init, (state) => ({
    ...state,
    nearby: { ...state.nearby, loading: true, error: null },
  })),
  on(HomeNearbyActions.requestMyArea, (state) => ({
    ...state,
    // A fresh pins/count fetch is coming once geolocation resolves either
    // way — `loading` covers that; `locating` is the OPT-IN button's own
    // busy state, cleared the moment geolocation itself settles (see
    // `originResolved`/`useFallbackOrigin` below), not when the follow-up
    // pins fetch does. `nearbyCount` is cleared here too (not left showing
    // the OLD branch's number) — `HomeHeroMapComponent` picks its pill's
    // i18n key from whether `userPin` is set, so leaving a stale count
    // in place across this transition would briefly pair the fallback
    // branch's number with the granted branch's "within Xkm" label (or vice
    // versa) until the fresh fetch resolves. Clearing it just re-triggers
    // the existing "hidden while null" pill state instead.
    nearby: { ...state.nearby, loading: true, locating: true, nearbyCount: null, error: null },
  })),
  on(HomeNearbyActions.originResolved, (state, { origin, accuracyMeters }) => ({
    ...state,
    nearby: { ...state.nearby, origin, isFallback: false, accuracyMeters, locating: false },
  })),
  on(HomeNearbyActions.useFallbackOrigin, (state) => ({
    ...state,
    // The map must still render — see `HomeNearbyState.origin`'s own doc
    // comment — so this sets a real centre (Yerevan) rather than leaving it
    // `null`, whether reached via `init` (nothing was ever asked) or a
    // denied/failed `requestMyArea` (asked and declined) — both end up
    // showing the identical fallback view.
    nearby: {
      ...state.nearby,
      origin: YEREVAN_CENTER,
      isFallback: true,
      accuracyMeters: null,
      locating: false,
    },
  })),
  on(HomeNearbyActions.pinsLoadSuccess, (state, { pins, nearbyCount }) => ({
    ...state,
    nearby: { ...state.nearby, pins, nearbyCount, loading: false, error: null },
  })),
  on(HomeNearbyActions.pinsLoadFailure, (state, { error }) => ({
    ...state,
    nearby: { ...state.nearby, loading: false, error },
  })),
);
