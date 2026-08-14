import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { makeAdminActivityItem, makeAdminOverview } from '../../../../../testing/fixtures';
import * as AdminOverviewActions from '../../store/admin-overview.actions';
import { adminOverviewFeatureKey } from '../../store/admin-overview.reducer';
import { initialAdminOverviewState } from '../../store/admin-overview.state';
import { OverviewPageComponent } from './overview-page.component';

/** Deterministic, assertable stand-in for real translation prose: echoes the key, with any
 *  interpolation params appended as JSON — lets tests assert which key/params a branch used
 *  without loading the real `en.json` (same idiom as `admin-reports.effects.spec.ts`'s
 *  `{ instant: (k) => k }` stub, extended to carry params through). Spies on the real
 *  `TranslateService.instant` (rather than swapping in a bare `{ instant }` object as the whole
 *  service) because the template's `| translate` pipe needs the rest of the real service
 *  (`get`/`onLangChange`/...) to not throw. */
function stubInstant(translate: TranslateService): void {
  vi.spyOn(translate, 'instant').mockImplementation(((
    key: string,
    params?: Record<string, unknown>,
  ) => (params ? `${key}:${JSON.stringify(params)}` : key)) as TranslateService['instant']);
}

describe('OverviewPageComponent', () => {
  let fixture: ComponentFixture<OverviewPageComponent>;
  let store: MockStore;

  async function configure(
    overrides: Partial<typeof initialAdminOverviewState> = {},
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [OverviewPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideMockStore({
          initialState: {
            [adminOverviewFeatureKey]: { ...initialAdminOverviewState, ...overrides },
          },
        }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    stubInstant(TestBed.inject(TranslateService));
  }

  async function setup(overrides: Partial<typeof initialAdminOverviewState> = {}): Promise<void> {
    await configure(overrides);
    fixture = TestBed.createComponent(OverviewPageComponent);
    fixture.detectChanges();
  }

  describe('fetch sharing with the shell', () => {
    it('dispatches loadOverview on construction when the store has no overview yet', async () => {
      await configure();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      TestBed.createComponent(OverviewPageComponent);
      expect(dispatchSpy).toHaveBeenCalledWith(AdminOverviewActions.loadOverview());
    });

    it('does not dispatch loadOverview when the overview is already loading (shell got there first)', async () => {
      await configure({ isLoadingOverview: true });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      TestBed.createComponent(OverviewPageComponent);
      expect(dispatchSpy).not.toHaveBeenCalledWith(AdminOverviewActions.loadOverview());
    });

    it('does not dispatch loadOverview when the overview is already loaded', async () => {
      await configure({ overview: makeAdminOverview() });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      TestBed.createComponent(OverviewPageComponent);
      expect(dispatchSpy).not.toHaveBeenCalledWith(AdminOverviewActions.loadOverview());
    });

    it('always dispatches loadActivityFeed on init (independent of the shell)', async () => {
      await configure({ overview: makeAdminOverview() });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const activityFixture = TestBed.createComponent(OverviewPageComponent);
      activityFixture.detectChanges();
      expect(dispatchSpy).toHaveBeenCalledWith(
        AdminOverviewActions.loadActivityFeed({ params: { take: 8 } }),
      );
    });
  });

  describe('the oldest-awaiting-review null-vs-zero distinction', () => {
    it('shows the caught-up copy when oldestAwaitingCreatedAt is null (queue empty)', async () => {
      await setup({
        overview: makeAdminOverview({ awaitingReviewCount: 0, oldestAwaitingCreatedAt: null }),
      });
      const text = fixture.componentInstance['awaitingReviewSubLabel']();
      expect(text).toBe('admin.overview.stats.awaitingReview.caughtUp');
    });

    it('shows an "oldest ... ago" line when oldestAwaitingCreatedAt is set, never "oldest 0 ago"', async () => {
      await setup({
        overview: makeAdminOverview({
          awaitingReviewCount: 3,
          oldestAwaitingCreatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        }),
      });
      const text = fixture.componentInstance['awaitingReviewSubLabel']();
      expect(text).toContain('admin.overview.stats.awaitingReview.oldest');
      expect(text).not.toContain('caughtUp');
    });
  });

  describe('reports sub-label', () => {
    it('shows "needs action" when openReportCount > 0', async () => {
      await setup({ overview: makeAdminOverview({ openReportCount: 2 }) });
      expect(fixture.componentInstance['reportsSubLabel']()).toBe(
        'admin.overview.stats.reports.needsAction',
      );
    });

    it('shows "all clear" when openReportCount is 0 (real zero, not "no data")', async () => {
      await setup({ overview: makeAdminOverview({ openReportCount: 0 }) });
      expect(fixture.componentInstance['reportsSubLabel']()).toBe(
        'admin.overview.stats.reports.allClear',
      );
    });
  });

  describe('CTA', () => {
    it('never hardcodes the review-time target — uses reviewTimeTargetHours from the server', async () => {
      await setup({
        overview: makeAdminOverview({ awaitingReviewCount: 5, reviewTimeTargetHours: 9 }),
      });
      const subtitle = fixture.componentInstance['ctaSubtitle']();
      expect(subtitle).toContain('"hours":9');
    });

    it('switches to the caught-up variant when awaitingReviewCount is 0', async () => {
      await setup({ overview: makeAdminOverview({ awaitingReviewCount: 0 }) });
      expect(fixture.componentInstance['ctaTitle']()).toBe('admin.overview.cta.caughtUpTitle');
    });

    it('uses the real awaitingReviewCount (not caught-up) when > 0', async () => {
      await setup({ overview: makeAdminOverview({ awaitingReviewCount: 5 }) });
      const title = fixture.componentInstance['ctaTitle']();
      expect(title).toContain('admin.overview.cta.title');
      expect(title).toContain('"count":5');
    });
  });

  describe('recent moderation feed composition', () => {
    it('composes the line from actor + action + target for a known action', async () => {
      await setup({
        activity: [
          makeAdminActivityItem({
            action: 'ListingApproved',
            actorFirstName: 'Sona',
            actorLastName: 'K.',
            targetLabel: 'STEM discovery lab kit',
          }),
        ],
      });
      const [item] = fixture.componentInstance['activity']();
      const line = fixture.componentInstance['activityLineText'](item);
      expect(line).toContain('admin.overview.activity.lines.ListingApproved');
      expect(line).toContain('"actor":"Sona K."');
      expect(line).toContain('"target":"STEM discovery lab kit"');
    });

    it('falls back to "Removed moderator" for a deleted actor (null first/last name)', async () => {
      await setup({
        activity: [makeAdminActivityItem({ actorFirstName: null, actorLastName: null })],
      });
      const [item] = fixture.componentInstance['activity']();
      const line = fixture.componentInstance['activityLineText'](item);
      expect(line).toContain('"actor":"admin.overview.activity.removedActor"');
    });

    it('falls back to the generic line for an unrecognised (future) action', async () => {
      await setup({ activity: [makeAdminActivityItem({ action: 'SomeFutureAction' })] });
      const [item] = fixture.componentInstance['activity']();
      const line = fixture.componentInstance['activityLineText'](item);
      expect(line).toContain('admin.overview.activity.lines.generic');
    });

    it('appends the from→to categories for a recategorise row with valid detailJson', async () => {
      await setup({
        activity: [
          makeAdminActivityItem({
            action: 'ListingRecategorised',
            detailJson: '{"fromCategory":"Wooden Toys","toCategory":"Pretend Play"}',
          }),
        ],
      });
      const [item] = fixture.componentInstance['activity']();
      const detail = fixture.componentInstance['activityDetailText'](item);
      expect(detail).toContain('Wooden Toys → Pretend Play');
    });

    it('degrades to the plain relative-time line when detailJson is malformed, never throws', async () => {
      await setup({
        activity: [
          makeAdminActivityItem({ action: 'ListingRecategorised', detailJson: '{not json' }),
        ],
      });
      const [item] = fixture.componentInstance['activity']();
      expect(() => fixture.componentInstance['activityDetailText'](item)).not.toThrow();
      expect(fixture.componentInstance['activityDetailText'](item)).not.toContain('→');
    });

    it('degrades to the plain relative-time line when detailJson is absent', async () => {
      await setup({
        activity: [makeAdminActivityItem({ action: 'ListingRecategorised', detailJson: null })],
      });
      const [item] = fixture.componentInstance['activity']();
      expect(fixture.componentInstance['activityDetailText'](item)).not.toContain('→');
    });
  });
});
