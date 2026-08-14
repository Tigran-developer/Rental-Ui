/**
 * The icon + colour palette an admin picks from when creating or restyling a category —
 * mirrors `CAT_ICONS` / `CAT_COLORS` in the design's `admin-shared.jsx`. This is literal
 * *design data* (a fixed picker palette), not a themeable token list, so it stays as
 * hardcoded arrays rather than CSS custom properties — see the task's token-mapping note.
 *
 * Shared between `features/admin` (the picker itself) and `features/home` (the public
 * category tiles, which render the same icon + colour an admin chose) — lives here, not in
 * either feature folder, so neither reaches into the other's `models/`.
 *
 * Every name in `CATEGORY_ICON_OPTIONS` has a matching glyph in
 * `shared/ui/icon/icon.component.ts`'s `ICONS` map (verified 1:1 against the design source).
 */
export const CATEGORY_ICON_OPTIONS: readonly string[] = [
  'grid',
  'home',
  'tag',
  'truck',
  'heart',
  'sparkle',
  'shield',
  'star',
  'clean',
  'camera',
  'calendar',
  'glob',
  'image',
  'clock',
];

export const CATEGORY_COLOR_OPTIONS: readonly string[] = [
  '#FFE6CC',
  '#E6F2D9',
  '#F0E6FF',
  '#D9E8FF',
  '#FFE0E0',
  '#E8EAFF',
  '#FFF1CC',
  '#D9F0EC',
  '#E6F4EE',
  '#EDEAE3',
];

/** Fallback icon for a category with no `iconName` (null/cleared). */
export const DEFAULT_CATEGORY_ICON = 'tag';

/** Fallback tile colour for a category with no `colorHex` (null/cleared) — the palette's
 *  last, neutral swatch; also what the design uses for the "create a new category on
 *  delete-reassign" shortcut before the admin picks anything else. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_OPTIONS[CATEGORY_COLOR_OPTIONS.length - 1];

/** Matches a 6- or 8-digit hex colour (`#RRGGBB` / `#RRGGBBAA`), case-insensitive. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Validates an untrusted `colorHex` value (e.g. straight off the API) before it is ever
 * interpolated into a style binding. Anything not matching `#RRGGBB`/`#RRGGBBAA` — including
 * `null`/empty — falls back to `DEFAULT_CATEGORY_COLOR`.
 */
export function toSafeCategoryColor(colorHex: string | null | undefined): string {
  return colorHex && HEX_COLOR_PATTERN.test(colorHex) ? colorHex : DEFAULT_CATEGORY_COLOR;
}
