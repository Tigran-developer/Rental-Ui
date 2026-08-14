import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminListingDetail } from '../../../../../testing/fixtures';
import { OwnerTrustPanelComponent } from './owner-trust-panel.component';

describe('OwnerTrustPanelComponent', () => {
  let fixture: ComponentFixture<OwnerTrustPanelComponent>;

  async function setup(
    overrides: Parameters<typeof makeAdminListingDetail>[0] = {},
  ): Promise<void> {
    // One test below calls `setup()` twice to compare two inputs — TestBed
    // refuses to reconfigure once a fixture has been created, so reset
    // first. A no-op the first time.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [OwnerTrustPanelComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(OwnerTrustPanelComponent);
    fixture.componentRef.setInput('listing', makeAdminListingDetail(overrides));
    fixture.detectChanges();
  }

  it('renders an em dash for a null owner rating instead of 0', async () => {
    await setup({ ownerRating: null });
    expect(
      fixture.nativeElement.querySelector('.owner-trust-panel__stat-value').textContent,
    ).toContain('—');
  });

  it('renders the numeric rating when present', async () => {
    await setup({ ownerRating: 4.7 });
    expect(
      fixture.nativeElement.querySelector('.owner-trust-panel__stat-value').textContent,
    ).toContain('4.7');
  });

  it('links "view profile" to /users/:ownerId', async () => {
    await setup({ ownerId: 'owner-42' });
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '.owner-trust-panel__profile-link',
    );
    expect(link.getAttribute('href')).toBe('/users/owner-42');
  });

  it('flags the open report count as a warning colour only when non-zero', async () => {
    await setup({ ownerOpenReportCount: 0 });
    expect(
      fixture.nativeElement.querySelector('.owner-trust-panel__row-value--negative'),
    ).toBeNull();

    await setup({ ownerOpenReportCount: 2 });
    expect(
      fixture.nativeElement.querySelector('.owner-trust-panel__row-value--negative'),
    ).not.toBeNull();
  });
});
