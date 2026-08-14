import type { Routes } from '@angular/router';
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { adminGuard } from './guards/admin.guard';
import { AdminCategoriesEffects } from './store/admin-categories.effects';
import {
  adminCategoriesFeatureKey,
  adminCategoriesReducer,
} from './store/admin-categories.reducer';
import { AdminModerationEffects } from './store/admin-moderation.effects';
import {
  adminModerationFeatureKey,
  adminModerationReducer,
} from './store/admin-moderation.reducer';
import { AdminOverviewEffects } from './store/admin-overview.effects';
import { adminOverviewFeatureKey, adminOverviewReducer } from './store/admin-overview.reducer';
import { AdminReportsEffects } from './store/admin-reports.effects';
import { adminReportsFeatureKey, adminReportsReducer } from './store/admin-reports.reducer';
import { AdminUsersEffects } from './store/admin-users.effects';
import { adminUsersFeatureKey, adminUsersReducer } from './store/admin-users.reducer';
import { ListingsEffects } from '../listings/store/listings.effects';
import { listingsFeatureKey, listingsReducer } from '../listings/store/listings.reducer';

export const adminRoutes: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    providers: [
      provideState(adminModerationFeatureKey, adminModerationReducer),
      provideEffects(AdminModerationEffects),
      // Overview screen (Phase 5) — its own slice: the stat tiles / CTA / recent-activity feed,
      // also read by AdminShellComponent for the rail badges + Queue health panel. Provided at
      // the parent `/admin` route (not just the `overview` child) precisely so the shell can
      // read it regardless of which admin tab is active — same reasoning as
      // adminModerationFeatureKey above for the review badge.
      provideState(adminOverviewFeatureKey, adminOverviewReducer),
      provideEffects(AdminOverviewEffects),
      // The review/inspect category control reuses the listings feature's
      // categories slice (same source `listings-filters` uses) rather than
      // adding a second HTTP call for the same data — see AdminCatSelect.
      provideState(listingsFeatureKey, listingsReducer),
      provideEffects(ListingsEffects),
      // Categories screen (Phase 2) — its own slice, distinct from both of the above:
      // the admin-only, moderation-shaped category list (isVisible/listingCount/colorHex).
      provideState(adminCategoriesFeatureKey, adminCategoriesReducer),
      provideEffects(AdminCategoriesEffects),
      // Users screen (Phase 3) — its own slice: the admin-only moderation row (email, system
      // role, account status, id-confirmation, flag count), distinct from all of the above.
      provideState(adminUsersFeatureKey, adminUsersReducer),
      provideEffects(AdminUsersEffects),
      // Reports & flags screen (Phase 4) — its own slice: the community-report triage queue
      // (severity/status, resolve/dismiss/reopen), distinct from all of the above.
      provideState(adminReportsFeatureKey, adminReportsReducer),
      provideEffects(AdminReportsEffects),
    ],
    loadComponent: () =>
      import('./layout/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'review' },
      {
        path: 'review',
        data: { titleKey: 'admin.console.nav.review' },
        loadComponent: () =>
          import('./pages/review-page/review-page.component').then((m) => m.ReviewPageComponent),
      },
      {
        path: 'review/:id',
        data: { titleKey: 'admin.console.nav.review' },
        loadComponent: () =>
          import('./pages/inspect-page/inspect-page.component').then((m) => m.InspectPageComponent),
      },
      // Legacy/bookmarked path — the admin bottom-nav link used to point
      // here directly; keep it working via redirect.
      { path: 'listings/pending', redirectTo: 'review', pathMatch: 'full' },
      {
        path: 'overview',
        data: { titleKey: 'admin.console.nav.overview' },
        loadComponent: () =>
          import('./pages/overview-page/overview-page.component').then(
            (m) => m.OverviewPageComponent,
          ),
      },
      {
        path: 'categories',
        data: { titleKey: 'admin.console.nav.categories' },
        loadComponent: () =>
          import('./pages/categories-page/categories-page.component').then(
            (m) => m.CategoriesPageComponent,
          ),
      },
      {
        path: 'users',
        data: { titleKey: 'admin.console.nav.users' },
        loadComponent: () =>
          import('./pages/users-page/users-page.component').then((m) => m.UsersPageComponent),
      },
      {
        path: 'reports',
        data: { titleKey: 'admin.console.nav.reports' },
        loadComponent: () =>
          import('./pages/reports-page/reports-page.component').then((m) => m.ReportsPageComponent),
      },
    ],
  },
];
