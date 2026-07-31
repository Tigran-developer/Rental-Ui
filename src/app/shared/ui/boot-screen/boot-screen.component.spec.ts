import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { BootScreenComponent } from './boot-screen.component';

function createFixture() {
  TestBed.configureTestingModule({
    imports: [BootScreenComponent, TranslateModule.forRoot()],
  });
  return TestBed.createComponent(BootScreenComponent);
}

describe('BootScreenComponent', () => {
  it('exposes role="status" for assistive tech', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
  });

  it('is visible and aria-busy by default (visible defaults to true)', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('dr-boot--hidden')).toBe(false);
    expect(host.getAttribute('aria-busy')).toBe('true');
  });

  it('fades out (hidden class, aria-busy false) once visible is set to false — the app.ts caller flips this once auth is no longer initializing', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('dr-boot--hidden')).toBe(true);
    expect(host.getAttribute('aria-busy')).toBe('false');
  });

  it('renders the animated dorent symbol in loading mode', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const symbol = host.querySelector('app-ui-dorent-symbol')!;
    expect(symbol).not.toBeNull();
    expect(symbol.getAttribute('data-mode')).toBe('loading');
  });
});
