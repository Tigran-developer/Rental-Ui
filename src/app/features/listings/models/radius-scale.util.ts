import type { LanguageCode } from '../../../shared/services/language.service';

/**
 * Log-scale math for the radius filter's single slider (design decision #1,
 * Maps P2 "location + radius": one logarithmic slider, 200 m – 20 km, plus 4
 * presets — no metre/kilometre unit toggle). The slider's own raw position
 * (`RADIUS_SLIDER_MIN..RADIUS_SLIDER_MAX`) is an internal implementation
 * detail — it is never shown to the user, stored, or serialized anywhere;
 * only the METRES it maps to are ever displayed (via `formatDistanceMeters`)
 * or persisted (as fractional km on the `radiusKm` filter/URL param — see
 * `listings-filter.model.ts`).
 */

export const RADIUS_MIN_METERS = 200;
export const RADIUS_MAX_METERS = 20000;
export const RADIUS_SLIDER_MIN = 0;
export const RADIUS_SLIDER_MAX = 1000;

/** The four quick-pick presets shown under the slider (approved design's own values). */
export const RADIUS_PRESET_METERS: readonly number[] = [500, 1000, 3000, 10000];

/**
 * Snaps a raw metre value to "round" steps so the slider never lands on an
 * ugly number like 437 m — 50 m steps below 1 km, 100 m steps below 3 km,
 * 500 m steps from 3 km up. Mirrors the approved design mockup's own
 * `snap()` (rewritten here in TypeScript, not copied verbatim).
 */
export function snapRadiusMeters(meters: number): number {
  if (meters < 1000) return Math.round(meters / 50) * 50;
  if (meters < 3000) return Math.round(meters / 100) * 100;
  return Math.round(meters / 500) * 500;
}

function clampMeters(meters: number): number {
  return Math.min(RADIUS_MAX_METERS, Math.max(RADIUS_MIN_METERS, meters));
}

/**
 * Maps a slider position (`RADIUS_SLIDER_MIN..RADIUS_SLIDER_MAX`) to metres
 * on a logarithmic curve from `RADIUS_MIN_METERS` to `RADIUS_MAX_METERS`,
 * then snaps the result — a purely linear mapping would make the whole top
 * half of the track represent a single kilometre either side of it, while
 * the log curve keeps dragging feeling proportionate near both ends.
 */
export function sliderValueToMeters(value: number): number {
  const clampedValue = Math.min(Math.max(value, RADIUS_SLIDER_MIN), RADIUS_SLIDER_MAX);
  const ratio = clampedValue / RADIUS_SLIDER_MAX;
  const raw = RADIUS_MIN_METERS * Math.pow(RADIUS_MAX_METERS / RADIUS_MIN_METERS, ratio);
  return clampMeters(snapRadiusMeters(raw));
}

/**
 * Inverse of `sliderValueToMeters` — positions the thumb (and highlights the
 * matching preset) when the metres value came from somewhere else: a preset
 * click, the URL (`radiusKm`), or the "origin just became set, default to
 * 1 km" auto-selection in `RadiusOriginFilterComponent`.
 */
export function metersToSliderValue(meters: number): number {
  const clamped = clampMeters(meters);
  const ratio =
    Math.log(clamped / RADIUS_MIN_METERS) / Math.log(RADIUS_MAX_METERS / RADIUS_MIN_METERS);
  return Math.round(ratio * RADIUS_SLIDER_MAX);
}

/** RounView to 2 decimals — matches `serializeRadiusKmParam`'s own rounding
 *  (`listings-filter.model.ts`) so a value round-tripped through the URL
 *  never drifts. */
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

export function kmToMeters(km: number): number {
  return Math.round(km * 1000);
}

export interface DistanceUnitLabels {
  readonly meters: string;
  readonly kilometers: string;
}

/**
 * Locale-aware label, e.g. "500 m" / "2.5 km" / "2,5 км" (`ru-RU`'s comma
 * decimal separator) — an explicit approved-design requirement for this one
 * control, UNLIKE the app's dram-currency formatting (`DramCurrencyPipe`),
 * which is deliberately locale-INDEPENDENT (always `en-US` grouping) for
 * cross-language consistency of prices. Uses the native `Intl.NumberFormat`
 * rather than Angular's `formatNumber`/`DecimalPipe`: the app never calls
 * `registerLocaleData` for `ru`/`hy` (only `en-US` ships with Angular by
 * default), so `formatNumber(x, 'ru-RU', ...)` would throw "Missing locale
 * data for locale" at runtime — `Intl.NumberFormat` needs no such
 * registration, it reads straight off the JS engine's built-in ICU data.
 * Unit words (`labels`) come from ngx-translate at the call site, never
 * hardcoded here.
 */
export function formatDistanceMeters(
  meters: number,
  localeTag: string,
  labels: DistanceUnitLabels,
): string {
  if (meters < 1000) {
    return `${Math.round(meters)} ${labels.meters}`;
  }
  const km = Math.round((meters / 1000) * 10) / 10;
  const isWhole = Number.isInteger(km);
  const formatted = new Intl.NumberFormat(localeTag, {
    minimumFractionDigits: isWhole ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(km);
  return `${formatted} ${labels.kilometers}`;
}

const LOCALE_TAG_BY_LANGUAGE: Record<LanguageCode, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  hy: 'hy-AM',
};

/** Maps the app's own `LanguageCode` to a BCP 47 tag for `Intl.NumberFormat`/`formatDistanceMeters`. */
export function localeTagForLanguage(code: LanguageCode): string {
  return LOCALE_TAG_BY_LANGUAGE[code];
}
