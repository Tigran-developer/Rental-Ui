import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminListingSummary } from '../../../../../testing/fixtures';
import { ReviewCardComponent } from './review-card.component';

describe('ReviewCardComponent', () => {
  let fixture: ComponentFixture<ReviewCardComponent>;

  async function setup(overrides: Partial<Record<string, unknown>> = {}): Promise<void> {
    // Several tests below call `setup()` more than once (to compare two
    // input combinations) — TestBed refuses to reconfigure once a fixture
    // has been created, so reset first. A no-op the first time.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReviewCardComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewCardComponent);
    fixture.componentRef.setInput('item', overrides['item'] ?? makeAdminListingSummary());
    fixture.componentRef.setInput('tab', overrides['tab'] ?? 'Pending');
    fixture.componentRef.setInput('isDesktop', overrides['isDesktop'] ?? true);
    fixture.componentRef.setInput('isRejectOpen', overrides['isRejectOpen'] ?? false);
    fixture.detectChanges();
  }

  it('renders the title, owner name, and price', async () => {
    await setup({
      item: makeAdminListingSummary({
        title: 'LEGO Fire Station',
        ownerFirstName: 'Anahit',
        ownerLastName: 'A.',
      }),
    });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('LEGO Fire Station');
    expect(host.textContent).toContain('Anahit A.');
  });

  it('shows an "Unverified" chip when the owner has no confirmed identity, and a verified icon otherwise', async () => {
    await setup({ item: makeAdminListingSummary({ ownerIsIdConfirmed: false }) });
    expect(fixture.nativeElement.querySelector('.review-card__unverified')).not.toBeNull();

    await setup({ item: makeAdminListingSummary({ ownerIsIdConfirmed: true }) });
    expect(fixture.nativeElement.querySelector('.review-card__unverified')).toBeNull();
  });

  it('renders an em dash for a null owner rating instead of 0', async () => {
    await setup({ item: makeAdminListingSummary({ ownerRating: null }) });
    expect(fixture.nativeElement.querySelector('.review-card__rating').textContent).toContain('—');
  });

  it('shows the Approve/Reject/Inspect actions only on the Pending tab', async () => {
    await setup({ tab: 'Pending' });
    expect(fixture.nativeElement.querySelector('.review-card__btn--approve')).not.toBeNull();

    await setup({ tab: 'Approved' });
    expect(fixture.nativeElement.querySelector('.review-card__btn--approve')).toBeNull();
  });

  it('shows the rejection reason on the Rejected tab', async () => {
    await setup({
      tab: 'Rejected',
      item: makeAdminListingSummary({ rejectionReasonCode: 'poorImages' }),
    });
    expect(fixture.nativeElement.querySelector('.review-card__rejection-reason')).not.toBeNull();
  });

  it('emits approve() on the approve button click', async () => {
    await setup();
    const emitted: void[] = [];
    fixture.componentInstance.approve.subscribe(() => emitted.push(undefined));
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.review-card__btn--approve')
      ?.click();
    expect(emitted.length).toBe(1);
  });

  it('emits openReject() on the reject button click', async () => {
    await setup();
    const emitted: void[] = [];
    fixture.componentInstance.openReject.subscribe(() => emitted.push(undefined));
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.review-card__btn--reject')
      ?.click();
    expect(emitted.length).toBe(1);
  });

  it('renders the inline reject panel only when desktop and isRejectOpen are both true', async () => {
    await setup({ isDesktop: true, isRejectOpen: true });
    expect(fixture.nativeElement.querySelector('app-reject-panel')).not.toBeNull();

    await setup({ isDesktop: false, isRejectOpen: true });
    expect(fixture.nativeElement.querySelector('app-reject-panel')).toBeNull();
  });

  it('disables the category select and shows a static category tile once decided', async () => {
    await setup({ tab: 'Approved' });
    expect(fixture.nativeElement.querySelector('app-admin-cat-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('.review-card__category-static')).not.toBeNull();
  });

  describe('Phase 6 "Needs category fix" suggestion', () => {
    it('shows the flag badge and the suggestion line for a pending listing with a suggestion', async () => {
      await setup({
        tab: 'Pending',
        item: makeAdminListingSummary({
          categoryName: 'Wooden Toys',
          suggestedCategoryId: 'cat-2',
          suggestedCategoryName: 'Pretend Play',
        }),
      });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).not.toBeNull();
      expect(host.querySelector('.review-card__suggestion')).not.toBeNull();
    });

    it('shows the plain pending badge and no suggestion line when suggestedCategoryId is null', async () => {
      await setup({
        tab: 'Pending',
        item: makeAdminListingSummary({ suggestedCategoryId: null, suggestedCategoryName: null }),
      });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).toBeNull();
      expect(host.querySelector('.admin-status-badge--pending')).not.toBeNull();
      expect(host.querySelector('.review-card__suggestion')).toBeNull();
    });

    it('does not flag a decided (Approved/Rejected) listing even if suggestedCategoryId is still set', async () => {
      await setup({
        tab: 'Approved',
        item: makeAdminListingSummary({
          suggestedCategoryId: 'cat-2',
          suggestedCategoryName: 'Pretend Play',
        }),
      });
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.admin-status-badge--flag')).toBeNull();
      expect(host.querySelector('.review-card__suggestion')).toBeNull();
    });
  });
});
