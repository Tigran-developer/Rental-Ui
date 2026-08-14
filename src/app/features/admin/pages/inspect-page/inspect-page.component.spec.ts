import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { actionsHarness, type ActionsHarness } from '../../../../../testing/ngrx.helpers';
import { makeAdminListingDetail } from '../../../../../testing/fixtures';
import * as AdminModerationActions from '../../store/admin-moderation.actions';
import { adminModerationFeatureKey } from '../../store/admin-moderation.reducer';
import { initialAdminModerationState } from '../../store/admin-moderation.state';
import { InspectPageComponent } from './inspect-page.component';

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

describe('InspectPageComponent', () => {
  let fixture: ComponentFixture<InspectPageComponent>;
  let store: MockStore;
  let router: { navigate: ReturnType<typeof vi.fn> };
  // InspectPageComponent injects NgRx's `Actions` stream directly (to react
  // to approve/reject success for *this* listing id) — provideMockStore
  // alone doesn't supply that, so every test needs the same
  // `provideMockActions` harness the effects specs use.
  let harness: ActionsHarness;

  async function setup(
    adminModerationOverrides: Partial<typeof initialAdminModerationState> = {},
    listingId = 'p1',
  ): Promise<void> {
    mockMatchMedia(true);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [InspectPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: listingId })) },
        },
        harness.provider,
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
    fixture = TestBed.createComponent(InspectPageComponent);
    fixture.detectChanges();
  }

  it('dispatches loadListingDetail for the routed id on init', async () => {
    await setup();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(InspectPageComponent);
    fixture.detectChanges();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.loadListingDetail({ listingId: 'p1' }),
    );
  });

  it('shows the skeleton while loading and no detail is present yet', async () => {
    await setup({ isDetailLoading: true, detail: null, detailListingId: null });
    expect(fixture.nativeElement.querySelector('.inspect-page__skeleton')).not.toBeNull();
  });

  it('shows the error state with retry + back-to-queue actions', async () => {
    await setup({ detailError: 'not found' });
    expect(fixture.nativeElement.querySelector('.inspect-page__error')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('not found');
  });

  it('renders the desktop dossier once the detail matching the route id has loaded', async () => {
    const detail = makeAdminListingDetail({ id: 'p1', title: 'Balance bike' });
    await setup({ detail, detailListingId: 'p1' });
    expect(fixture.nativeElement.querySelector('.inspect-desktop')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Balance bike');
  });

  it('does not render a stale listing while the route id and loaded detail id disagree', async () => {
    const detail = makeAdminListingDetail({ id: 'OTHER', title: 'Stale listing' });
    await setup({ detail, detailListingId: 'OTHER', isDetailLoading: false });
    expect(fixture.nativeElement.textContent).not.toContain('Stale listing');
  });

  it('renders the mobile dossier + sticky action bar under the mobile breakpoint', async () => {
    mockMatchMedia(false);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    const detail = makeAdminListingDetail({ id: 'p1', status: 'PendingApproval' });
    await TestBed.configureTestingModule({
      imports: [InspectPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'p1' })) } },
        harness.provider,
        provideMockStore({
          initialState: {
            [adminModerationFeatureKey]: {
              ...initialAdminModerationState,
              detail,
              detailListingId: 'p1',
            },
            listings: { categories: [] },
          },
        }),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InspectPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspect-mobile')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.inspect-mobile__action-bar')).not.toBeNull();
  });

  it('hides the decision actions once a listing is no longer PendingApproval', async () => {
    const detail = makeAdminListingDetail({ id: 'p1', status: 'Approved' });
    await setup({ detail, detailListingId: 'p1' });
    expect(fixture.nativeElement.querySelector('.inspect-desktop__decision')).toBeNull();
  });

  it('dispatches approveListing/updateListingCategory for the loaded listing', async () => {
    const detail = makeAdminListingDetail({ id: 'p1', status: 'PendingApproval' });
    await setup({ detail, detailListingId: 'p1' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    fixture.componentInstance['approve']();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.approveListing({ listingId: 'p1' }),
    );

    fixture.componentInstance['changeCategory']({ categoryId: 'c2', categoryName: 'New' });
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminModerationActions.updateListingCategory({
        listingId: 'p1',
        categoryId: 'c2',
        categoryName: 'New',
      }),
    );
  });

  it('navigates back to /admin/review once approveListingSuccess fires for this id', async () => {
    const detail = makeAdminListingDetail({ id: 'p1', status: 'PendingApproval' });
    await setup({ detail, detailListingId: 'p1' });

    harness.send(AdminModerationActions.approveListingSuccess({ listingId: 'p1' }));

    expect(router.navigate).toHaveBeenCalledWith(['/admin/review']);
  });

  it('does not navigate away when a different listing succeeds', async () => {
    const detail = makeAdminListingDetail({ id: 'p1', status: 'PendingApproval' });
    await setup({ detail, detailListingId: 'p1' });

    harness.send(AdminModerationActions.approveListingSuccess({ listingId: 'someone-else' }));

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('dispatches clearListingDetail on destroy', async () => {
    await setup();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture.destroy();
    expect(dispatchSpy).toHaveBeenCalledWith(AdminModerationActions.clearListingDetail());
  });

  describe('Phase 6 "Needs category fix" suggestion', () => {
    it('shows the flag badge and suggestion banner for a pending listing with a suggestion', async () => {
      const detail = makeAdminListingDetail({
        id: 'p1',
        status: 'PendingApproval',
        categoryName: 'Wooden Toys',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Pretend Play',
      });
      await setup({ detail, detailListingId: 'p1' });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).not.toBeNull();
      expect(host.querySelector('.inspect-desktop__category-suggestion')).not.toBeNull();
      expect(host.querySelector('.inspect-desktop__category-suggestion-apply')).not.toBeNull();
    });

    it('shows no banner and the plain pending badge when suggestedCategoryId is null', async () => {
      const detail = makeAdminListingDetail({
        id: 'p1',
        status: 'PendingApproval',
        suggestedCategoryId: null,
        suggestedCategoryName: null,
      });
      await setup({ detail, detailListingId: 'p1' });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).toBeNull();
      expect(host.querySelector('.inspect-desktop__category-suggestion')).toBeNull();
    });

    it('does not flag a decided (Approved) listing even if suggestedCategoryId is still set', async () => {
      const detail = makeAdminListingDetail({
        id: 'p1',
        status: 'Approved',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Pretend Play',
      });
      await setup({ detail, detailListingId: 'p1' });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).toBeNull();
      expect(host.querySelector('.inspect-desktop__category-suggestion')).toBeNull();
    });

    it('applySuggestion() dispatches updateListingCategory with the suggested category', async () => {
      const detail = makeAdminListingDetail({
        id: 'p1',
        status: 'PendingApproval',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Pretend Play',
      });
      await setup({ detail, detailListingId: 'p1' });
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      fixture.componentInstance['applySuggestion']();

      expect(dispatchSpy).toHaveBeenCalledWith(
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'cat-2',
          categoryName: 'Pretend Play',
        }),
      );
    });

    it('the Apply button in the DOM triggers applySuggestion()', async () => {
      const detail = makeAdminListingDetail({
        id: 'p1',
        status: 'PendingApproval',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Pretend Play',
      });
      await setup({ detail, detailListingId: 'p1' });
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const host: HTMLElement = fixture.nativeElement;
      host.querySelector<HTMLButtonElement>('.inspect-desktop__category-suggestion-apply')?.click();

      expect(dispatchSpy).toHaveBeenCalledWith(
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'cat-2',
          categoryName: 'Pretend Play',
        }),
      );
    });
  });
});
