import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageService } from '../../../../shared/services/language.service';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';
import { districtDisplayName } from '../../models/district-ui.util';
import type { ListingDistrict } from '../../models/district.model';

/**
 * Honest uncertainty radius (metres) drawn around a fuzzed listing pin.
 *
 * The backend snaps non-owner coordinates to the centroid of a geohash-6 cell
 * — roughly 933m (east-west) x 611m (north-south) at Yerevan's latitude (see
 * `ListingDetails.latitude`/`longitude` doc comment and `GeohashSnapper` in
 * rental-api). 600m is a deliberately conservative single radius covering
 * that cell's shorter axis and most of its longer one — never draw a radius
 * smaller than the real uncertainty, or the map implies more precision than
 * we actually have, which is the exact failure this feature exists to avoid.
 */
export const APPROXIMATE_AREA_RADIUS_METERS = 600;

/** City-level framing zoom — close enough to read the circle, not so close
 *  that the fuzz radius reads as "the house". */
const DETAIL_MAP_ZOOM = 15;

/**
 * Listing-detail location block (P1-8): always shows the district + city as
 * text; when the listing has a coordinate, the map renders immediately on
 * page load — no tap-to-load gate.
 *
 * **Reversed 2026-07-24 (human decision, Tigran):** this used to sit behind a
 * `mapRequested` signal + "Show map" button specifically so a page view never
 * hit the tile server (see ADR-007's original text and M-017's neighbourhood).
 * That reasoning is gone: ADR-007's 2026-07-22 amendment moved tiles off raw
 * `tile.openstreetmap.org` onto MapTiler with a real key. MapTiler's free tier
 * has its own cap (100k tiles/month), but measured production traffic leaves
 * comfortable headroom — a tradeoff made knowingly, not an oversight. See the
 * ADR-007 amendment-of-the-amendment for the full writeup.
 *
 * The map is a frozen `app-map` thumbnail (non-interactive) with a
 * translucent circle honestly sized to the backend's real fuzz radius — see
 * `APPROXIMATE_AREA_RADIUS_METERS` — plus a floating "approximate area" chip.
 * The privacy promise made in three languages in the create-listing wizard
 * (only the general area is shown, never the exact address) used to live in
 * the placeholder copy this component no longer has; it now lives in
 * `privacyNote`, rendered as a caption under the map, alongside the chip —
 * see `listing-location.component.html`.
 *
 * Degradation: if `app-map` reports `mapError` (dynamic `import('leaflet')`
 * rejected, tile host unreachable, etc.), this falls back to the district +
 * city text plus the `mapUnavailable` line — never an empty grey box. This
 * behaviour is unchanged by the 2026-07-24 reversal.
 *
 * No coordinates at all (`latitude`/`longitude` null — legal, the pin is
 * optional) means no map affordance is shown, per spec — just the text.
 */
@Component({
  selector: 'app-listing-location',
  standalone: true,
  imports: [MapComponent, TranslatePipe],
  templateUrl: './listing-location.component.html',
  styleUrl: './listing-location.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingLocationComponent {
  private readonly languageService = inject(LanguageService);

  readonly city = input.required<string>();
  readonly district = input<ListingDistrict | null>(null);
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);

  protected readonly circleRadiusMeters = APPROXIMATE_AREA_RADIUS_METERS;
  protected readonly mapZoom = DETAIL_MAP_ZOOM;

  /** True if `app-map` reported it could not come up; permanent for this
   *  view — the fallback text + district above are always still available. */
  protected readonly mapFailed = signal(false);

  protected readonly districtName = computed<string | null>(() => {
    const d = this.district();
    return d ? districtDisplayName(d, this.languageService.current().code) : null;
  });

  protected readonly hasCoordinates = computed<boolean>(
    () => typeof this.latitude() === 'number' && typeof this.longitude() === 'number',
  );

  protected readonly pin = computed<MapLatLng | null>(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  });

  protected onMapError(): void {
    this.mapFailed.set(true);
  }
}
