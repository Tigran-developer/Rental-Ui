import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminUser } from '../../../../../testing/fixtures';
import { AdminUserProfileDialogComponent } from './admin-user-profile-dialog.component';

describe('AdminUserProfileDialogComponent', () => {
  let fixture: ComponentFixture<AdminUserProfileDialogComponent>;

  async function setup(overrides: Parameters<typeof makeAdminUser>[0] = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AdminUserProfileDialogComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminUserProfileDialogComponent);
    fixture.componentRef.setInput('user', makeAdminUser(overrides));
    fixture.componentRef.setInput('isDesktop', true);
    fixture.detectChanges();
  }

  it('renders the three stat tiles', async () => {
    await setup({ listingCount: 12, rentalCount: 47, flagCount: 3 });
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-user-profile-dialog__stat-value'),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    expect(values).toEqual(['12', '47', '3']);
  });

  it('renders the flags stat in danger colour only when greater than zero', async () => {
    await setup({ flagCount: 0 });
    expect(
      fixture.nativeElement.querySelector('.admin-user-profile-dialog__stat-value--danger'),
    ).toBeNull();
  });

  it('hides the "view reports" affordance when there are no flags', async () => {
    await setup({ flagCount: 0 });
    expect(
      fixture.nativeElement.querySelector('.admin-user-profile-dialog__reports-btn'),
    ).toBeNull();
  });

  it('shows the "view reports" affordance when flags > 0', async () => {
    await setup({ flagCount: 2 });
    expect(
      fixture.nativeElement.querySelector('.admin-user-profile-dialog__reports-btn'),
    ).not.toBeNull();
  });

  it('emits viewReports when the affordance is clicked', async () => {
    await setup({ flagCount: 2 });
    const spy = vi.fn();
    fixture.componentInstance.viewReports.subscribe(spy);
    (
      fixture.nativeElement.querySelector(
        '.admin-user-profile-dialog__reports-btn',
      ) as HTMLButtonElement
    ).click();
    expect(spy).toHaveBeenCalled();
  });

  it('marks Suspend aria-disabled (but keeps it focusable) when canSuspend is false, and blocks the click', async () => {
    await setup({ status: 'Active' });
    fixture.componentRef.setInput('canSuspend', false);
    fixture.componentRef.setInput(
      'suspendDisabledReasonKey',
      'admin.users.actions.suspendDisabledAdmin',
    );
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      '.admin-user-profile-dialog__action--danger',
    ) as HTMLButtonElement;

    // Native `disabled` would drop the button from the tab order entirely and make its
    // `aria-describedby` reason unreachable by keyboard — `aria-disabled` keeps it focusable
    // while still preventing the action.
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-describedby')).toBe('admin-user-profile-dialog-suspend-reason');

    const suspendSpy = vi.fn();
    fixture.componentInstance.suspend.subscribe(suspendSpy);
    btn.click();
    expect(suspendSpy).not.toHaveBeenCalled();
  });

  it('natively disables Suspend while busy', async () => {
    await setup({ status: 'Active' });
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      '.admin-user-profile-dialog__action--danger',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('emits close and restores focus to the previously-focused element on Escape', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    await setup({});
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeSpy).toHaveBeenCalled();

    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
