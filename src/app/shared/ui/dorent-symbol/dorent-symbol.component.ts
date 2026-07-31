import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

let instanceCounter = 0;

/**
 * The DoRent brand mark — orange ball + white wave, standing in for the "o"
 * in "DoRent". One reusable component for three consumers: the desktop
 * header brand (hover-triggered), the mobile app-open boot screen
 * (always-on loading loop), and the Home mobile guest topbar (static).
 *
 * The component never listens for hover/focus itself — the parent (e.g.
 * `AppHeaderComponent`) owns that and drives `animate()`. This is what lets
 * a consumer add keyboard-focus parity for free.
 *
 * ── "No visible swap" contract ──────────────────────────────────────────
 * One element, always mounted, always the same geometry (`viewBox="0 0 100
 * 100"`, `overflow: visible` so the bounce/shadow paint outside the box
 * without reflowing anything). Rest state is IDENTICAL to the animation's 0%
 * keyframe (`translateY(0) scale(1,1)`), so starting the loop never pops.
 *
 * Stopping is the hard part: measured in a real Chromium instance (not
 * assumed), removing the CSS `animation` mid-flight via
 * `transition: transform` does NOT ease the ball home — it snaps instantly
 * to the base transform. So `animate() → false` does not remove
 * `.is-animating` right away; it defers to the next `animationiteration`
 * event on the ball, which only fires once the loop has eased itself back
 * through its own 0%/100% (rest) keyframe. The class is removed exactly
 * when the transform is already at rest, so there is no visible snap.
 *
 * Under `prefers-reduced-motion: reduce` there is no loop to defer to —
 * the CSS `animation` rule never applies (see the `.scss`), so
 * `animationiteration` never fires. Deferring the falling edge to an event
 * that can never arrive would leave `.is-animating` stuck forever after the
 * first hover. So the falling edge branches: with reduced motion, clear it
 * immediately (there is nothing mid-flight to ease home); otherwise defer
 * to `animationiteration` as above.
 */
@Component({
  selector: 'app-ui-dorent-symbol',
  standalone: true,
  templateUrl: './dorent-symbol.component.html',
  styleUrl: './dorent-symbol.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dr-symbol',
    '[class.is-animating]': 'animating()',
    '[style.--dr-symbol-size.px]': 'size()',
    '[attr.data-mode]': 'mode()',
  },
})
export class DorentSymbolComponent {
  /** Rendered ball diameter in px. */
  readonly size = input<number>(20);
  readonly mode = input<'hover' | 'loading'>('hover');
  /** Parent-driven: hover/focus state (header) or "always on" (boot screen). */
  readonly animate = input<boolean>(false);

  /** Unique per instance — three copies of this component can coexist on Home. */
  protected readonly clipId = `dr-symbol-clip-${++instanceCounter}`;

  /**
   * The class actually applied to the host. Mirrors `animate()` on the
   * rising edge immediately (no pop — 0% keyframe === rest). On the falling
   * edge it stays true until `onBallAnimationIteration` observes the loop
   * has come back around to its rest keyframe, see class doc above.
   */
  protected readonly animating = signal(false);

  /**
   * Decided once, at construction — mirrors the `matchMedia` guard in
   * `map.component.ts` (`typeof matchMedia === 'function' && ...`) so a test
   * host or an unusually old runtime without `matchMedia` just degrades to
   * "not reduced motion" rather than throwing.
   */
  private readonly prefersReducedMotion: boolean =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    effect(() => {
      if (this.animate()) {
        this.animating.set(true);
      } else if (this.prefersReducedMotion) {
        // No animation loop is running, so there is no `animationiteration`
        // to defer to (see class doc) — clear the falling edge right away,
        // or it would stick forever after the first hover.
        this.animating.set(false);
      }
    });
  }

  protected onBallAnimationIteration(): void {
    if (!this.animate()) {
      this.animating.set(false);
    }
  }
}
