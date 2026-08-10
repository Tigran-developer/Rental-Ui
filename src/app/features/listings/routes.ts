import type { Routes } from '@angular/router';
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { authGuard } from '../auth/guards/auth.guard';
import { ListingsEffects } from './store/listings.effects';
import { listingsFeatureKey, listingsReducer } from './store/listings.reducer';
import { BookingsEffects } from '../bookings/store/bookings.effects';
import { bookingsFeatureKey, bookingsReducer } from '../bookings/store/bookings.reducer';
import { FavoritesEffects } from '../favorites/store/favorites.effects';
import { favoritesFeatureKey, favoritesReducer } from '../favorites/store/favorites.reducer';
import { PublicProfilesEffects } from '../public-profiles/store/public-profiles.effects';
import {
  publicProfilesFeatureKey,
  publicProfilesReducer,
} from '../public-profiles/store/public-profiles.reducer';
import { ReviewsEffects } from '../reviews/store/reviews.effects';
import { reviewsFeatureKey, reviewsReducer } from '../reviews/store/reviews.reducer';
import { ChatEffects } from '../chat/store/chat.effects';
import { chatFeatureKey, chatReducer } from '../chat/store/chat.reducer';

export const listingsRoutes: Routes = [
  {
    path: '',
    providers: [
      provideState(listingsFeatureKey, listingsReducer),
      provideEffects(ListingsEffects),
      provideState(bookingsFeatureKey, bookingsReducer),
      provideEffects(BookingsEffects),
      provideState(favoritesFeatureKey, favoritesReducer),
      provideEffects(FavoritesEffects),
      provideState(publicProfilesFeatureKey, publicProfilesReducer),
      provideEffects(PublicProfilesEffects),
      provideState(reviewsFeatureKey, reviewsReducer),
      provideEffects(ReviewsEffects),
      // The booking confirmation screen (`:id/book`) dispatches
      // `openConversationFromBooking` for its "Message {owner}" CTA — the chat
      // store is registered lazily per consuming route (like bookings/favorites/
      // reviews above), never app-wide, so it must be provided here too.
      provideState(chatFeatureKey, chatReducer),
      provideEffects(ChatEffects),
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/listings-page/listings-page.component').then(
            (m) => m.ListingsPageComponent,
          ),
      },
      {
        path: 'create',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./pages/create-listing-page/create-listing-page.component').then(
            (m) => m.CreateListingPageComponent,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./pages/listing-details-page/listing-details-page.component').then(
            (m) => m.ListingDetailsPageComponent,
          ),
      },
      {
        path: ':id/book',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./pages/listing-booking-page/listing-booking-page.component').then(
            (m) => m.ListingBookingPageComponent,
          ),
      },
    ],
  },
];
