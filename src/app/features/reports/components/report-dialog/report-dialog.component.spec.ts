import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import type { Report } from '../../models/report.model';
import { ReportsApiService } from '../../services/reports-api.service';
import { ReportDialogComponent } from './report-dialog.component';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    targetType: 'Listing',
    targetId: 'listing-1',
    targetLabel: 'Balance bike',
    reasonCode: 'unsafeItem',
    detail: null,
    severity: 'Low',
    status: 'Open',
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function setup(submitReport: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [ReportDialogComponent, TranslateModule.forRoot()],
    providers: [{ provide: ReportsApiService, useValue: { submitReport } }],
  });
  const fixture: ComponentFixture<ReportDialogComponent> =
    TestBed.createComponent(ReportDialogComponent);
  fixture.componentRef.setInput('target', { targetType: 'listing', targetId: 'listing-1' });
  fixture.detectChanges();
  return fixture;
}

describe('ReportDialogComponent', () => {
  it('disables submit until a reason is selected', () => {
    const fixture = setup(vi.fn());
    const component = fixture.componentInstance;
    expect(component['canSubmit']()).toBe(false);

    component['selectReason']('unsafeItem');
    fixture.detectChanges();
    expect(component['canSubmit']()).toBe(true);
  });

  it('submits the lowercase target type, the selected reason, and a trimmed detail', () => {
    const submitReport = vi.fn().mockReturnValue(of(makeReport()));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;

    component['selectReason']('unsafeItem');
    component['detail'].set('  the wheel is loose  ');
    component['submit']();

    expect(submitReport).toHaveBeenCalledWith({
      targetType: 'listing',
      targetId: 'listing-1',
      reasonCode: 'unsafeItem',
      detail: 'the wheel is loose',
    });
  });

  it('shows a success outcome (not an error) and emits `submitted` on 201', () => {
    const report = makeReport({ id: 'report-9' });
    const submitReport = vi.fn().mockReturnValue(of(report));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;
    let emitted: Report | undefined;
    component.submitted.subscribe((r) => (emitted = r));

    component['selectReason']('unsafeItem');
    component['submit']();

    expect(component['phase']()).toBe('success');
    expect(emitted).toEqual(report);
  });

  it('treats `report.already_reported` (409) as a normal outcome, not an error', () => {
    const problem = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'report.already_reported', title: 'Already reported' },
    });
    const submitReport = vi.fn().mockReturnValue(throwError(() => problem));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;

    component['selectReason']('spam');
    component['submit']();

    // Not the 'error' phase — the already-reported outcome has its own distinct, non-red
    // rendering path (see `report-dialog.component.html`'s `alreadyReported` case).
    expect(component['phase']()).toBe('alreadyReported');
    expect(component['phase']()).not.toBe('error');
  });

  it('shows a translated message for a known error code (report.user_blocked)', () => {
    const problem = new HttpErrorResponse({
      status: 403,
      error: { errorCode: 'report.user_blocked', title: 'Blocked' },
    });
    const submitReport = vi.fn().mockReturnValue(throwError(() => problem));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;

    component['selectReason']('spam');
    component['submit']();

    expect(component['phase']()).toBe('error');
    expect(component['errorMessageKey']()).toBe('reports.dialog.errors.userBlocked');
  });

  it('falls back to the raw server message for an unrecognised error code', () => {
    const problem = new HttpErrorResponse({
      status: 500,
      error: { title: 'Server exploded' },
    });
    const submitReport = vi.fn().mockReturnValue(throwError(() => problem));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;

    component['selectReason']('spam');
    component['submit']();

    expect(component['phase']()).toBe('error');
    expect(component['errorMessageKey']()).toBeNull();
    expect(component['errorMessage']()).toBe('Server exploded');
  });

  it('returns to the form on "try again" without losing the selected reason', () => {
    const submitReport = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
    const fixture = setup(submitReport);
    const component = fixture.componentInstance;

    component['selectReason']('spam');
    component['submit']();
    expect(component['phase']()).toBe('error');

    component['tryAgain']();
    expect(component['phase']()).toBe('form');
    expect(component['selectedReason']()).toBe('spam');
  });

  it('emits `closed` on backdrop click when not submitting', () => {
    const fixture = setup(vi.fn());
    const component = fixture.componentInstance;
    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    component['onBackdropClick']();
    expect(closedCount).toBe(1);
  });
});
