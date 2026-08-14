import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AdminStatusBadgeComponent, AdminStatusBadgeVariant } from './admin-status-badge.component';

describe('AdminStatusBadgeComponent', () => {
  let fixture: ComponentFixture<AdminStatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStatusBadgeComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminStatusBadgeComponent);
  });

  function render(variant: AdminStatusBadgeVariant, size: 'sm' | 'md' = 'md'): HTMLElement {
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.admin-status-badge');
  }

  const variants: AdminStatusBadgeVariant[] = ['pending', 'approved', 'rejected', 'flag'];

  for (const variant of variants) {
    it(`renders the "${variant}" variant with its modifier class and a dot`, () => {
      const el = render(variant);
      expect(el.classList).toContain(`admin-status-badge--${variant}`);
      expect(el.querySelector('.admin-status-badge__dot')).not.toBeNull();
      expect(el.textContent?.trim().length).toBeGreaterThan(0);
    });
  }

  it('applies the size modifier class', () => {
    const el = render('pending', 'sm');
    expect(el.classList).toContain('admin-status-badge--sm');
  });

  it('defaults to size "md"', () => {
    fixture.componentRef.setInput('variant', 'approved');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.admin-status-badge');
    expect(el.classList).toContain('admin-status-badge--md');
  });
});
