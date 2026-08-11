import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng, MapMarkerGroup } from '../../../../shared/ui/map/map.component';

/**
 * Zoom derived from the visible radius (Home hero design): a wider radius
 * needs a wider view to still show its whole circle, so this trades zoom
 * against radius on three fixed steps rather than a caller picking a zoom
 * value that might not agree with whatever radius is on screen.
 * `radiusMeters === null` (no circle — geolocation denied) falls into the
 * closest-in step: there is no radius to accommodate, so the tightest,
 * most legible city-block zoom is the right default. Exported for direct
 * unit testing of the threshold table without mounting the component.
 */
export function deriveHeroMapZoom(radiusMeters: number | null): number {
  if (radiusMeters !== null && radiusMeters > 2200) return 12;
  if (radiusMeters !== null && radiusMeters > 1400) return 13;
  return 14;
}

/**
 * Home hero's ambient "nearby toys" preview map (Home-page design alignment,
 * Part 1). A thin wrapper around `shared/ui/map`'s `app-map`: owns the panel
 * chrome (rounded/bordered/shadowed frame — see hero-map.component.scss) and
 * projects the "N toys nearby" pill into `app-map`'s `[app-map-overlay]`
 * slot. Never imports Leaflet or knows a tile URL itself — `app-map` is the
 * only file allowed to (`Rental-Ui/CLAUDE.md`).
 *
 * Always renders `[interactive]="false"` (`app-map`'s own default — the
 * "frozen thumbnail" mode: no drag/wheel-zoom/double-click-zoom/touch-zoom/
 * keyboard, and `zoomControl` is always constructed disabled regardless —
 * see `MapComponent`'s own class doc comment) and `[markerVariant]="'twinkle'"`
 * (small, purely decorative dots — never a tab stop, never clickable; see
 * `MapComponent.markerVariant`'s own doc comment). Between those two, the
 * only interactive/focusable element this can ever render is `app-map`'s own
 * licence-mandated MapTiler attribution logo (shown identically by every
 * other static `app-map` usage in the app, e.g. the create-listing wizard's
 * location preview) — nothing THIS component adds is a tab stop.
 *
 * The template binds `[pin]="center()"` with `[showPin]="false"` — `app-map`
 * anchors its `circleRadiusMeters` circle to `pin` (or the crosshair centre
 * in crosshair mode), NEVER to `center` directly (`center`/`zoom` only
 * decide the INITIAL viewport `L.map()` is constructed with — see
 * `MapComponent.syncCircle()`). Without a `pin`, `radiusMeters` would be
 * silently ignored and no circle would ever draw. `showPin=false` suppresses
 * the orange teardrop marker `pin` would otherwise also render at that same
 * coordinate — the design wants only the circle there, not a duplicate
 * marker — mirroring `ListingsMapComponent`'s own `anchorPin`+`showPin=false`
 * pattern for its listing-detail maps.
 *
 * **Geolocation is opt-in, not automatic** (`/code-review` +
 * `/security-review` both flagged the earlier automatic-prompt-on-load
 * behaviour — see `HomeNearbyActions`' own doc comment in `home.actions.ts`
 * for the full reasoning). `userPin() !== null` is this component's own
 * signal for "the visitor has already granted geolocation" — `HomePageComponent`
 * only ever sets `userPin` once a real fix is resolved (never for the
 * Yerevan fallback) — so it doubles as BOTH the gate for the opt-in button
 * (`@if (!granted())` — hidden once there's nothing left to opt into) and the
 * switch between the pill's two i18n keys (`nearbyCountKey` below), with no
 * extra input needed for either. The button itself is projected into
 * `app-map`'s `[app-map-actions]` slot (bottom-right, already reserved
 * 44px clear of Leaflet's attribution control — see that slot's own doc
 * comment in map.component.ts, "my location" is its own example use case)
 * and styled with `app-map`'s own unscoped `.app-map__btn` class, the exact
 * pattern `LocationPickerComponent`'s "My location" button already uses — a
 * real, keyboard-reachable `<button>` with a visible focus ring and a
 * translated `aria-label`, the ONE intentional tab stop this panel adds.
 */
@Component({
  selector: 'app-home-hero-map',
  standalone: true,
  imports: [MapComponent, TranslatePipe],
  templateUrl: './hero-map.component.html',
  styleUrl: './hero-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHeroMapComponent {
  readonly center = input.required<MapLatLng>();
  /** The visitor's own position — a second, blue pulsing marker — or `null`
   *  while unknown/denied (see `app-map`'s own `userPin` doc comment). */
  readonly userPin = input<MapLatLng | null>(null);
  /** The browser's own confidence radius (metres) for `userPin`. `null`:
   *  no accuracy circle (mirrors `app-map`'s own default). */
  readonly userAccuracyMeters = input<number | null>(null);
  /** The orange search-radius circle's radius, metres. `null`: no circle
   *  drawn at all (passed straight through to `app-map`'s
   *  `circleRadiusMeters`) — the geolocation-denied case, where there is no
   *  real "your radius" to show. */
  readonly radiusMeters = input<number | null>(null);
  readonly markers = input<MapMarkerGroup[]>([]);
  /** Count for whichever branch produced `markers` — "within Xkm of you"
   *  when granted, "in Yerevan" when showing the fallback (see
   *  `nearbyCountKey` below for which i18n key that picks) — or `null`
   *  while unknown. The pill renders ONLY when this is non-null — see the
   *  template — so the first paint never flashes a false "0 toys nearby"
   *  before the count fetch resolves. */
  readonly nearbyCount = input<number | null>(null);
  /** `true` while an opt-in geolocation request (triggered by THIS
   *  component's own button, below) is in flight — disables the button so a
   *  visitor can't double-dispatch the browser permission prompt. */
  readonly locating = input<boolean>(false);
  readonly height = input<string>('330px');

  /** Emitted when the opt-in "show my area" button (`@if (!granted())` in
   *  the template) is clicked — the ONLY place in this component that asks
   *  for geolocation, and it doesn't ask directly: the caller
   *  (`HomePageComponent`) owns the actual `GeolocationService` call via the
   *  `HomeNearbyActions.requestMyArea` effect flow, keeping this component
   *  as ignorant of the store as `app-map` is of Leaflet's tile URL. */
  readonly requestMyArea = output<void>();

  protected readonly zoom = computed(() => deriveHeroMapZoom(this.radiusMeters()));

  /** `true` once the visitor's own position is known — `HomePageComponent`
   *  only ever sets `userPin` for a genuinely resolved geolocation fix,
   *  never for the Yerevan fallback (see this class's own doc comment) — so
   *  this single check doubles as both "hide the opt-in button, nothing
   *  left to opt into" and "which pill i18n key applies" below. */
  protected readonly granted = computed(() => this.userPin() !== null);

  /** Which i18n key the pill renders through — see `HomeNearbyState
   *  .isFallback`'s own doc comment (`home.state.ts`) for why the granted
   *  and fallback counts must never share one string: they answer different
   *  questions ("within Xkm of you" vs. "in Yerevan"), an order of
   *  magnitude apart. */
  protected readonly nearbyCountKey = computed(() =>
    this.granted() ? 'home.heroMap.nearbyCount' : 'home.heroMap.cityCount',
  );
}
