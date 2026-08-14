import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminUser } from '../../../../../testing/fixtures';
import { AdminUserActionsPanelComponent } from './admin-user-actions-panel.component';

describe('AdminUserActionsPanelComponent', () => {
  let fixture: ComponentFixture<AdminUserActionsPanelComponent>;

  async function setup(overrides: Parameters<typeof makeAdminUser>[0] = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AdminUserActionsPanelComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminUserActionsPanelComponent);
    fixture.componentRef.setInput('user', makeAdminUser(overrides));
    fixture.componentRef.setInput('isDesktop', true);
    fixture.detectChanges();
  }

  function menuItemLabels(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.admin-user-actions-panel__item'),
    ).map((el) => (el as HTMLElement).textContent?.trim() ?? '');
  }

  it('shows Verify and Suspend for a Pending, unverified user', async () => {
    await setup({ status: 'Pending' });
    const labels = menuItemLabels();
    expect(labels.some((l) => l.includes('admin.users.actions.verify'))).toBe(true);
    expect(labels.some((l) => l.includes('admin.users.actions.suspend'))).toBe(true);
    expect(labels.some((l) => l.includes('admin.users.actions.reactivate'))).toBe(false);
  });

  it('shows only Suspend for an Active user', async () => {
    await setup({ status: 'Active' });
    const labels = menuItemLabels();
    expect(labels.some((l) => l.includes('admin.users.actions.verify'))).toBe(false);
    expect(labels.some((l) => l.includes('admin.users.actions.suspend'))).toBe(true);
  });

  it('shows Reactivate instead of Suspend for a Suspended user', async () => {
    await setup({ status: 'Suspended' });
    const labels = menuItemLabels();
    expect(labels.some((l) => l.includes('admin.users.actions.reactivate'))).toBe(true);
    expect(labels.some((l) => l.includes('admin.users.actions.suspend'))).toBe(false);
  });

  it('marks Suspend aria-disabled (but keeps it focusable) when canSuspend is false, and blocks the click', async () => {
    await setup({ status: 'Active' });
    fixture.componentRef.setInput('canSuspend', false);
    fixture.componentRef.setInput(
      'suspendDisabledReasonKey',
      'admin.users.actions.suspendDisabledAdmin',
    );
    fixture.detectChanges();
    const suspendBtn = fixture.nativeElement.querySelector(
      '.admin-user-actions-panel__item--danger',
    ) as HTMLButtonElement;

    // Native `disabled` would drop the button from the tab order entirely and make its
    // `aria-describedby` reason unreachable by keyboard — `aria-disabled` keeps it focusable
    // while still preventing the action.
    expect(suspendBtn.disabled).toBe(false);
    expect(suspendBtn.getAttribute('aria-disabled')).toBe('true');
    expect(suspendBtn.getAttribute('aria-describedby')).toBe(
      'admin-user-actions-panel-suspend-reason-menu',
    );

    const suspendSpy = vi.fn();
    fixture.componentInstance.suspend.subscribe(suspendSpy);
    suspendBtn.click();
    expect(suspendSpy).not.toHaveBeenCalled();
  });

  it('natively disables Suspend while busy', async () => {
    await setup({ status: 'Active' });
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const suspendBtn = fixture.nativeElement.querySelector(
      '.admin-user-actions-panel__item--danger',
    ) as HTMLButtonElement;
    expect(suspendBtn.disabled).toBe(true);
  });

  it('emits verify/suspend/reactivate on click', async () => {
    await setup({ status: 'Pending' });
    const verifySpy = vi.fn();
    fixture.componentInstance.verify.subscribe(verifySpy);
    const verifyBtn = fixture.nativeElement.querySelector(
      '.admin-user-actions-panel__item--primary',
    ) as HTMLButtonElement;
    verifyBtn.click();
    expect(verifySpy).toHaveBeenCalled();
  });

  it('emits cancel and restores focus to the previously-focused element on Escape', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    await setup({ status: 'Active' });
    const cancelSpy = vi.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cancelSpy).toHaveBeenCalled();

    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('does not close on Escape while busy', async () => {
    await setup({ status: 'Active' });
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const cancelSpy = vi.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
