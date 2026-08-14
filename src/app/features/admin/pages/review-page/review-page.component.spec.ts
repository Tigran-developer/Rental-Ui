import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminListingSummary } from '../../../../../testing/fixtures';
import * as AdminModerationActions from '../../store/admin-moderation.actions';
import { adminModerationFeatureKey } from '../../store/admin-moderation.reducer';
import { initialAdminModerationState } from '../../store/admin-moderation.state';
import { ReviewPageComponent } from './review-page.component';

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

describe('ReviewPageComponent', () => {
  let fixture: ComponentFixture<ReviewPageComponent>;
  let store: MockStore;

  async function configure(
    adminModerationOverrides: Partial<typeof initialAdminModerationState> = {},
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReviewPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideMockStore({
          initialState: {
            [adminModerationFeatureKey]: {
              ...initialAdminModerationState,
              ...adminModerationOverrides,
            },
            listings: { categories: [] },
          },
        }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  }

  async function setup(
    adminModerationOverrides: Partial<typeof initialAdminModerationState> = {},
  ): Promise<void> {
    mockMatchMedia(true);
    await configure(adminModerationOverrides);
    fixture = TestBed.createComponent(ReviewPageComponent);
    fixture.detectChanges();
  }

  it('dispatches loadListingQueue on init', async () => {
    mockMatchMedia(true);
    await configure();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(ReviewPageComponent);
    fixture.detectChanges();
    expect(dispatchSpy).toHaveBeenCalledWith(AdminModerationActions.loadListingQueue());
  });

  it('shows the card-shaped skeleton while loading with no items yet', async () => {
    await setup({ isLoading: true, items: [] });
    expect(
      fixture.nativeElement.querySelectorAll('.review-page__skeleton-card').length,
    ).toBeGreaterThan(0);
  });

  it('shows the empty state once loaded with no items', async () => {
    await setup({ isLoading: false, items: [] });
    expect(fixture.nativeElement.querySelector('app-ui-empty-state')).not.toBeNull();
  });

  it('renders one review-card per queue item', async () => {
    await setup({
      isLoading: false,
      items: [makeAdminListingSummary({ id: 'p1' }), makeAdminListingSummary({ id: 'p2' })],
    });
    expect(fixture.nativeElement.querySelectorAll('app-review-card').length).toBe(2);
  });

  it('dispatches setQueueStatusFilter when a tab is selected', async () => {
    await setup({ isLoading: false, items: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture.componentInstance['selectTab']('Approved');
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.setQueueStatusFilter({ status: 'Approved' }),
    );
  });

  it('dispatches approveListing/rejectListing/updateListingCategory with the right ids', async () => {
    await setup({ isLoading: false, items: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.componentInstance['approve']('p1');
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.approveListing({ listingId: 'p1' }),
    );

    fixture.componentInstance['openReject']('p2');
    fixture.componentInstance['reasonSel'].set('poorImages');
    fixture.componentInstance['confirmReject']();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.rejectListing({ listingId: 'p2', reasonCode: 'poorImages', note: '' }),
    );

    fixture.componentInstance['changeCategory']('p3', { categoryId: 'c1', categoryName: 'Wooden' });
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.updateListingCategory({
        listingId: 'p3',
        categoryId: 'c1',
        categoryName: 'Wooden',
      }),
    );
  });

  it('closes the reject state after confirming', async () => {
    await setup({ isLoading: false, items: [] });
    fixture.componentInstance['openReject']('p1');
    fixture.componentInstance['reasonSel'].set('poorImages');
    fixture.componentInstance['confirmReject']();
    expect(fixture.componentInstance['rejectingId']()).toBeNull();
  });

  it('shows the shared bottom sheet instead of the inline panel on mobile', async () => {
    mockMatchMedia(false);
    await TestBed.configureTestingModule({
      imports: [ReviewPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideMockStore({
          initialState: {
            [adminModerationFeatureKey]: {
              ...initialAdminModerationState,
              items: [makeAdminListingSummary({ id: 'p1' })],
            },
            listings: { categories: [] },
          },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReviewPageComponent);
    fixture.detectChanges();

    fixture.componentInstance['openReject']('p1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-reject-sheet')).not.toBeNull();
  });
});
