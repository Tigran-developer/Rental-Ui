import { TestBed } from '@angular/core/testing';

import { DorentSymbolComponent } from './dorent-symbol.component';

const state = {
  // Drives the `matchMedia('(prefers-reduced-motion: reduce)')` stub below —
  // flips whether `dorent-symbol.component.ts`'s `prefersReducedMotion`
  // (read once, at construction) comes out `true` or `false` for the NEXT
  // component created.
  reducedMotion: false,
};

/**
 * jsdom has no `matchMedia`. The component reads
 * `matchMedia('(prefers-reduced-motion: reduce)')` exactly once per
 * instance, at construction — so `state.reducedMotion` must be set BEFORE
 * `TestBed.createComponent()` for a given test, not after. Every other query
 * falls back to `matches: false`, matching every other test in this file
 * (which assume full motion, i.e. the `matchMedia === 'function'` guard
 * degrading to `false` would also work — this stub just makes the
 * reduced-motion case explicitly testable too).
 */
vi.stubGlobal(
  'matchMedia',
  vi.fn(
    (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' && state.reducedMotion,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
        onchange: null,
      }) as unknown as MediaQueryList,
  ),
);

function createFixture() {
  TestBed.configureTestingModule({
    imports: [DorentSymbolComponent],
  });
  return TestBed.createComponent(DorentSymbolComponent);
}

describe('DorentSymbolComponent', () => {
  afterEach(() => {
    state.reducedMotion = false;
  });

  it('renders exactly one ball', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('.dr-symbol__ball-fill').length).toBe(1);
    expect(host.querySelectorAll('svg').length).toBe(1);
  });

  it('does not add is-animating when animate is false', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('is-animating')).toBe(false);
  });

  it('adds is-animating immediately when animate becomes true (no delay on the rising edge)', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('animate', true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('is-animating')).toBe(true);
  });

  it('holds is-animating after animate flips back to false, until the ball loop reports an iteration boundary', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('animate', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    // Still animating — the loop hasn't come back around to rest yet. This
    // is the "hold until animationiteration" technique verified against a
    // real Chromium instance: `transition: transform` does not ease a
    // mid-flight ball home when the animation class is removed early — it
    // snaps. Removing the class must wait for the loop's own natural return
    // to its 0%/100% (rest) keyframe.
    expect(host.classList.contains('is-animating')).toBe(true);

    const ball = host.querySelector('.dr-symbol__ball')!;
    ball.dispatchEvent(new Event('animationiteration'));
    fixture.detectChanges();

    expect(host.classList.contains('is-animating')).toBe(false);
  });

  it('clears is-animating immediately on the falling edge under prefers-reduced-motion, with no animationiteration event', () => {
    // Regression for the permanent-shadow-blob defect: under reduced motion
    // there is no CSS `animation` loop running (see the .scss's `@media`
    // gate), so `animationiteration` can never fire. The falling edge must
    // not depend on it.
    state.reducedMotion = true;

    const fixture = createFixture();
    fixture.componentRef.setInput('animate', true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('is-animating')).toBe(true);

    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();

    // No `animationiteration` dispatched here — that is the whole point.
    expect(host.classList.contains('is-animating')).toBe(false);
  });

  it('ignores an animationiteration event while animate is still true', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('animate', true);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const ball = host.querySelector('.dr-symbol__ball')!;
    ball.dispatchEvent(new Event('animationiteration'));
    fixture.detectChanges();

    expect(host.classList.contains('is-animating')).toBe(true);
  });

  it('applies the requested size as a CSS custom property on the host', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('size', 17);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.style.getPropertyValue('--dr-symbol-size')).toBe('17px');
  });

  it('gives each instance a unique clip-path id', () => {
    // Both instances share one configured TestBed module — `createFixture()`
    // (which re-configures) can only be called once per test; a second
    // `TestBed.createComponent` reuses the already-instantiated module.
    const fixtureA = createFixture();
    fixtureA.detectChanges();
    const fixtureB = TestBed.createComponent(DorentSymbolComponent);
    fixtureB.detectChanges();

    const clipA = (fixtureA.nativeElement as HTMLElement).querySelector('clipPath')!.id;
    const clipB = (fixtureB.nativeElement as HTMLElement).querySelector('clipPath')!.id;

    expect(clipA).not.toBe('');
    expect(clipB).not.toBe('');
    expect(clipA).not.toBe(clipB);
  });
});
