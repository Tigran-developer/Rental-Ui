import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { RatingSummaryComponent, type RatingSummaryView } from './rating-summary.component';

async function createFixture(
  summary: RatingSummaryView,
  variant: 'compact' | 'full' = 'full',
  distribution: readonly number[] | null = null,
): Promise<ComponentFixture<RatingSummaryComponent>> {
  await TestBed.configureTestingModule({
    imports: [RatingSummaryComponent, TranslateModule.forRoot()],
  }).compileComponents();

  const fixture = TestBed.createComponent(RatingSummaryComponent);
  fixture.componentRef.setInput('summary', summary);
  fixture.componentRef.setInput('variant', variant);
  fixture.componentRef.setInput('distribution', distribution);
  fixture.detectChanges();
  return fixture;
}

describe('RatingSummaryComponent', () => {
  it('shows the empty state when hasAggregate is false, never a fabricated 0.0', async () => {
    const fixture = await createFixture(
      { average: 0, reviewCount: 1, hasAggregate: false },
      'full',
      [0, 1, 0, 0, 0],
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('reviews.summary.noReviews');
    expect(text).not.toContain('0.0');
  });

  it('falls back to the plain stacked layout when no distribution is provided (existing profile-page usage)', async () => {
    const fixture = await createFixture({ average: 4.5, reviewCount: 10, hasAggregate: true });
    const panel = fixture.debugElement.query(By.css('.rating-summary__panel'));
    expect(panel).toBeNull();
    expect((fixture.nativeElement.textContent as string)).toContain('4.5');
  });

  it('renders the two-column distribution panel when a full 5-entry distribution is provided', async () => {
    // 10 reviews: two 5★, one 4★, none 3★/2★, seven 1★ — deliberately uneven
    // so percentages are distinguishable per row.
    const fixture = await createFixture(
      { average: 3.1, reviewCount: 10, hasAggregate: true },
      'full',
      [7, 0, 0, 1, 2],
    );

    const panel = fixture.debugElement.query(By.css('.rating-summary__panel'));
    expect(panel).not.toBeNull();

    const rows = fixture.debugElement.queryAll(By.css('.rating-summary__dist-row'));
    expect(rows.length).toBe(5);

    // Rows render 5★ down to 1★ (starsDesc order).
    const fiveStarPct = rows[0].query(By.css('.rating-summary__dist-pct'))
      .nativeElement.textContent as string;
    expect(fiveStarPct.trim()).toBe('20%'); // 2 / 10

    const oneStarPct = rows[4].query(By.css('.rating-summary__dist-pct'))
      .nativeElement.textContent as string;
    expect(oneStarPct.trim()).toBe('70%'); // 7 / 10
  });

  it('does not render the distribution panel for the compact variant even if a distribution is passed', async () => {
    const fixture = await createFixture(
      { average: 4.2, reviewCount: 5, hasAggregate: true },
      'compact',
      [0, 0, 1, 2, 2],
    );
    expect(fixture.debugElement.query(By.css('.rating-summary__panel'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.rating-summary--compact'))).not.toBeNull();
  });

  it('falls back to the stacked layout when the distribution array is not exactly 5 entries', async () => {
    const fixture = await createFixture(
      { average: 4.0, reviewCount: 3, hasAggregate: true },
      'full',
      [1, 1, 1],
    );
    expect(fixture.debugElement.query(By.css('.rating-summary__panel'))).toBeNull();
  });
});
