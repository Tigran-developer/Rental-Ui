import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckPillComponent } from './check-pill.component';

describe('CheckPillComponent', () => {
  let fixture: ComponentFixture<CheckPillComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckPillComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CheckPillComponent);
  });

  it('renders the ok tint and label when ok=true', () => {
    fixture.componentRef.setInput('ok', true);
    fixture.componentRef.setInput('label', 'Photos verified');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('.check-pill');
    expect(el.classList).toContain('check-pill--ok');
    expect(el.classList).not.toContain('check-pill--bad');
    expect(el.textContent?.trim()).toContain('Photos verified');
  });

  it('renders the danger tint when ok=false', () => {
    fixture.componentRef.setInput('ok', false);
    fixture.componentRef.setInput('label', 'Missing hygiene notes');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement.querySelector('.check-pill');
    expect(el.classList).toContain('check-pill--bad');
    expect(el.classList).not.toContain('check-pill--ok');
  });
});
