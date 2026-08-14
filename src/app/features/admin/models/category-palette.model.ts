/**
 * The icon + colour palette an admin picks from when creating or restyling a category —
 * mirrors `CAT_ICONS` / `CAT_COLORS` in the design's `admin-shared.jsx`. This is literal
 * *design data* (a fixed picker palette), not a themeable token list, so it stays as
 * hardcoded arrays rather than CSS custom properties — see the task's token-mapping note.
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
