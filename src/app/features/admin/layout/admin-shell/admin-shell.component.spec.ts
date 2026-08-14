import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminOverview } from '../../../../../testing/fixtures';
import { adminModerationFeatureKey } from '../../store/admin-moderation.reducer';
import { initialAdminModerationState } from '../../store/admin-moderation.state';
import { adminOverviewFeatureKey } from '../../store/admin-overview.reducer';
import {
  initialAdminOverviewState,
  type AdminOverviewState,
} from '../../store/admin-overview.state';
import { AdminShellComponent } from './admin-shell.component';

function mockMatchMedia(matchesDesktop: boolean): void {
  (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = ((query: string) => ({
    matches: query === '(min-width: 961px)' ? matchesDesktop : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof matchMedia;
}

function createFixture(
  adminModerationOverrides: Partial<typeof initialAdminModerationState> = {},
  adminOverviewOverrides: Partial<AdminOverviewState> = {},
): ComponentFixture<AdminShellComponent> {
  TestBed.configureTestingModule({
    imports: [AdminShellComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideMockStore({
        initialState: {
          [adminModerationFeatureKey]: {
            ...initialAdminModerationState,
            ...adminModerationOverrides,
          },
          [adminOverviewFeatureKey]: {
            ...initialAdminOverviewState,
            ...adminOverviewOverrides,
          },
        },
      }),
    ],
  });
  return TestBed.createComponent(AdminShellComponent);
}

describe('AdminShellComponent — responsive branch selection', () => {
  it('renders the desktop topbar + rail chrome at ≥961px', () => {
    mockMatchMedia(true);
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.admin-topbar')).not.toBeNull();
    expect(host.querySelector('.admin-rail')).not.toBeNull();
    expect(host.querySelector('.admin-mobile-header')).toBeNull();
    expect(host.querySelector('.admin-mobile-nav')).toBeNull();
  });

  it('renders the mobile header + bottom nav chrome at <961px', () => {
    mockMatchMedia(false);
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.admin-mobile-header')).not.toBeNull();
    expect(host.querySelector('.admin-mobile-nav')).not.toBeNull();
    expect(host.querySelector('.admin-topbar')).toBeNull();
    expect(host.querySelector('.admin-rail')).toBeNull();
  });

  it('flips branch on window resize', () => {
    mockMatchMedia(true);
    const fixture = createFixture();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-topbar')).not.toBeNull();

    mockMatchMedia(false);
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-topbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-mobile-header')).not.toBeNull();
  });

  it('renders all five nav destinations on desktop', () => {
    mockMatchMedia(true);
    const fixture = createFixture();
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('.admin-rail__link');
    expect(links.length).toBe(5);
  });

  it('renders a loading-skeleton (not a hardcoded number) for nav counts and queue health while both queue and overview are loading', () => {
    mockMatchMedia(true);
    const fixture = createFixture({ isLoading: true });
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    // Only Review/Categories/Reports show a meta value at all (Overview and
    // Users have none, matching the design) — Review is mid-load (adminModeration
    // slice) and Categories/Reports depend on the still-unloaded adminOverview
    // slice (default state: overview === null).
    expect(host.querySelectorAll('.admin-rail__meta-skeleton').length).toBe(3);
    expect(host.querySelectorAll('.admin-rail__queue-health-skeleton').length).toBe(3);
  });

  it('shows the live review count once the queue has finished loading', () => {
    mockMatchMedia(true);
    const fixture = createFixture({
      isLoading: false,
      counts: { pending: 4, approved: 0, rejected: 0 },
    });
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const reviewLink = Array.from(
      host.querySelectorAll<HTMLAnchorElement>('.admin-rail__link'),
    ).find((link) => link.getAttribute('href') === '/admin/review');
    expect(reviewLink?.querySelector('.admin-rail__meta--badge')?.textContent?.trim()).toBe('4');
  });

  it('shows the live categories/reports counts once the overview has loaded', () => {
    mockMatchMedia(true);
    const fixture = createFixture(
      {},
      { overview: makeAdminOverview({ categoryCount: 10, openReportCount: 2 }) },
    );
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('.admin-rail__link'));
    const categoriesLink = links.find((link) => link.getAttribute('href') === '/admin/categories');
    const reportsLink = links.find((link) => link.getAttribute('href') === '/admin/reports');
    expect(categoriesLink?.querySelector('.admin-rail__meta')?.textContent?.trim()).toBe('10');
    expect(reportsLink?.querySelector('.admin-rail__meta--badge')?.textContent?.trim()).toBe('2');
  });

  it('converts the real average-review-time to hours (rounded to one decimal) once the overview has loaded', () => {
    mockMatchMedia(true);
    const fixture = createFixture(
      {},
      { overview: makeAdminOverview({ averageReviewTimeMinutes: 192 }) },
    );
    fixture.detectChanges();

    // 192 minutes / 60 = 3.2h.
    const queueHealth = fixture.componentInstance['queueHealth']();
    expect(queueHealth.avgReviewHours).toBe(3.2);
    expect(queueHealth.hasAvgReviewData).toBe(true);
  });

  it('shows a dash (not the skeleton) when averageReviewTimeMinutes is null — "no data yet", not "0 minutes"', () => {
    mockMatchMedia(true);
    const fixture = createFixture(
      {},
      { overview: makeAdminOverview({ averageReviewTimeMinutes: null }) },
    );
    fixture.detectChanges();
    const queueHealth = fixture.componentInstance['queueHealth']();
    expect(queueHealth.avgReviewHours).toBeNull();
    expect(queueHealth.hasAvgReviewData).toBe(false);

    // The dd cell renders a dash, not the eternally-pulsing skeleton, once overview has loaded
    // but there's genuinely nothing to show.
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('.admin-rail__queue-health-row');
    expect(rows[1].querySelector('dd')?.textContent?.trim()).toBe('—');
    expect(rows[1].querySelector('.admin-rail__queue-health-skeleton')).toBeNull();
  });

  it('keeps a real 0 as 0 (not the "no data" dash) for averageReviewTimeMinutes', () => {
    mockMatchMedia(true);
    const fixture = createFixture(
      {},
      { overview: makeAdminOverview({ averageReviewTimeMinutes: 0 }) },
    );
    fixture.detectChanges();
    const queueHealth = fixture.componentInstance['queueHealth']();
    expect(queueHealth.avgReviewHours).toBe(0);
    expect(queueHealth.hasAvgReviewData).toBe(true);
  });
});
