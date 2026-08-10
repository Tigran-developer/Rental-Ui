import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { DatePicker } from 'primeng/datepicker';

import {
  BookingCalendarComponent,
  expandBookedDateRangesToDisabledDates,
} from './booking-calendar.component';
import type { BookedDateRange } from '../../models/listing.model';

/**
 * Host mirroring `listing-booking-page`: it feeds an external controlled range in
 * and, on every user selection, resets that controlled range to `null` (the real
 * parent's behaviour). This reproduces the round-trip that used to snap the
 * calendar's visible month back to today.
 */
@Component({
  standalone: true,
  imports: [BookingCalendarComponent],
  template: `<app-booking-calendar
    [bookedDates]="[]"
    [pricePerDay]="10"
    [value]="controlledRange()"
    (dateRangeSelected)="onRange($event)"
  />`,
})
class BookingCalendarHostComponent {
  readonly controlledRange = signal<Date[] | null>(null);
  onRange(_event: { startDate: Date | null; endDate: Date | null }): void {
    this.controlledRange.set(null);
  }
}

async function createHost() {
  TestBed.configureTestingModule({
    imports: [BookingCalendarHostComponent, TranslateModule.forRoot()],
  });
  const fixture = TestBed.createComponent(BookingCalendarHostComponent);
  fixture.detectChanges();
  // Drain the NgModel init microtask before interacting, so its deferred
  // first-write cannot be mistaken for the regression under test.
  await fixture.whenStable();
  const datePicker = fixture.debugElement.query(By.directive(DatePicker))
    .componentInstance as DatePicker;
  return { fixture, datePicker };
}

describe('BookingCalendarComponent', () => {
  it('keeps the datepicker on the viewed future month after a start-date click', async () => {
    const { fixture, datePicker } = await createHost();

    // Page the calendar to a month two ahead of today, mirroring a user who
    // navigated forward before picking a start date.
    const now = new Date();
    const targetMonthAbs = now.getFullYear() * 12 + now.getMonth() + 2;
    const targetYear = Math.floor(targetMonthAbs / 12);
    const targetMonth = targetMonthAbs % 12;
    datePicker.currentYear = targetYear;
    datePicker.currentMonth = targetMonth;
    datePicker.createMonths(targetMonth, targetYear);

    // Click a start date inside that visible month (partial range → [start, null]).
    datePicker.onDateSelect(new MouseEvent('click'), {
      year: targetYear,
      month: targetMonth,
      day: 15,
      selectable: true,
      today: false,
      otherMonth: false,
    });
    fixture.detectChanges();
    // Flush the deferred NgModel write-back — the snap was asynchronous.
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    // The visible month must NOT snap back to today's month.
    expect(datePicker.currentMonth).toBe(targetMonth);
    expect(datePicker.currentYear).toBe(targetYear);
  });

  it('feeds the emitted selection back to the datepicker by reference (no identity churn)', async () => {
    const { fixture } = await createHost();
    const component = fixture.debugElement.query(By.directive(BookingCalendarComponent))
      .componentInstance as unknown as {
      onRangeChange(value: Date | Date[] | null | undefined): void;
      rangeSelection: () => Date[] | null;
    };

    const emitted = [new Date(2026, 8, 15), null] as unknown as Date[];
    component.onRangeChange(emitted);

    // Same array reference the calendar emitted — reference-equality is what keeps
    // Angular's NgModel from scheduling a redundant writeValue()/updateUI().
    expect(component.rangeSelection()).toBe(emitted);
  });

  it('re-emits the start/end split from a partial range', async () => {
    const { fixture } = await createHost();
    const calendar = fixture.debugElement.query(By.directive(BookingCalendarComponent))
      .componentInstance as BookingCalendarComponent;

    let received: { startDate: Date | null; endDate: Date | null } | null = null;
    calendar.dateRangeSelected.subscribe((event) => (received = event));

    const start = new Date(2026, 8, 15);
    (calendar as unknown as { onRangeChange(v: Date[]): void }).onRangeChange([
      start,
      null,
    ] as unknown as Date[]);

    expect(received!.startDate).toBe(start);
    expect(received!.endDate).toBeNull();
  });
});

describe('expandBookedDateRangesToDisabledDates', () => {
  function isoDatesOf(dates: Date[]): string[] {
    return dates
      .map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
      .sort();
  }

  it('expands a single-day range (start === end) to exactly that one day', () => {
    const ranges: BookedDateRange[] = [
      { startDate: '2026-09-10', endDate: '2026-09-10' },
    ];

    const result = expandBookedDateRangesToDisabledDates(ranges);

    expect(isoDatesOf(result)).toEqual(['2026-8-10']);
  });

  it('expands a multi-day range inclusive of both endpoints', () => {
    const ranges: BookedDateRange[] = [
      { startDate: '2026-09-10', endDate: '2026-09-12' },
    ];

    const result = expandBookedDateRangesToDisabledDates(ranges);

    expect(isoDatesOf(result)).toEqual(['2026-8-10', '2026-8-11', '2026-8-12']);
  });

  it('expands two disjoint ranges into the union of their days, without bridging the gap', () => {
    const ranges: BookedDateRange[] = [
      { startDate: '2026-09-10', endDate: '2026-09-11' },
      { startDate: '2026-09-20', endDate: '2026-09-21' },
    ];

    const result = expandBookedDateRangesToDisabledDates(ranges);

    expect(isoDatesOf(result)).toEqual([
      '2026-8-10',
      '2026-8-11',
      '2026-8-20',
      '2026-8-21',
    ]);
    // The gap between the two ranges must stay available.
    expect(isoDatesOf(result)).not.toContain('2026-8-15');
  });

  it('returns an empty array for no booked ranges', () => {
    expect(expandBookedDateRangesToDisabledDates([])).toEqual([]);
  });
});
