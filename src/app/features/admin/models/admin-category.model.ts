/**
 * Admin console Phase 2: the Categories screen.
 *
 * Distinct from the *public* category shape — `ListingCategoryOption`
 * (`features/listings/models/create-listing.model.ts`), backed by the anonymous
 * `GET /api/categories` → `CategoryResponse` and consumed by the renter-facing category
 * picker/filter. That shape carries `imageUrl` but none of the moderation-facing fields below.
 * This one is what an admin sees on the Categories screen — mirrors `AdminCategoryResponse`
 * (`GET /api/admin/categories`, `[Authorize(Roles = "Admin")]`) and carries
 * `isVisible`/`listingCount`/`colorHex`, none of which the public endpoint exposes. Do not reuse
 * or merge the two — they mirror different backend DTOs that are free to diverge further.
 */

/**
 * Mirrors `AdminCategoryResponse` (rental-api `Application/DTOs/AdminCategoryResponse.cs`).
 * `listingCount` counts Approved listings only (a moderator's "live listings in this category" —
 * see the backend doc comment on the DTO).
 */
export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  iconName: string | null;
  colorHex: string | null;
  displayOrder: number;
  isVisible: boolean;
  listingCount: number;
}

/**
 * Mirrors `AdminCategoriesSummary`. `totalListedToys` is the sum of every category's
 * `listingCount` (Approved-only).
 */
export interface AdminCategoriesSummary {
  totalCategories: number;
  visibleCount: number;
  totalListedToys: number;
}

/** Mirrors `AdminCategoriesResponse` — the `GET /api/admin/categories` envelope. */
export interface AdminCategoryList {
  items: AdminCategory[];
  summary: AdminCategoriesSummary;
}

/**
 * Mirrors `CreateCategoryRequest`. No PATCH ambiguity here (this is a POST): an omitted or
 * empty `iconName`/`colorHex` are both treated as "no value" by the backend.
 */
export interface CreateAdminCategoryRequest {
  name: string;
  iconName?: string;
  colorHex?: string;
}

/**
 * Mirrors `UpdateCategoryRequest`'s PATCH semantics exactly. Every field is independently
 * tri-state, expressed with plain JS key-optionality — Angular's `HttpClient` JSON-serializes
 * the body with `JSON.stringify`, which drops `undefined`-valued keys, so this maps 1:1 onto the
 * wire without needing a wrapper type:
 *  - key omitted (`undefined`)      → leave the field unchanged
 *  - `''` / whitespace-only string  → clear the field (`iconName`/`colorHex` only — `name` can
 *                                      never be cleared; the backend rejects a blank name)
 *  - a non-empty string             → set the field to that value
 *
 * Do NOT collapse "omitted" and "cleared" into a single optional-string type — callers need to
 * express both distinctly (e.g. rename a category without touching its icon: `{ name: 'x' }`,
 * vs. clear the icon without touching the name: `{ iconName: '' }`).
 */
export interface UpdateAdminCategoryRequest {
  name?: string;
  iconName?: string;
  colorHex?: string;
}

/** Mirrors `UpdateCategoryVisibilityRequest`. */
export interface UpdateAdminCategoryVisibilityRequest {
  isVisible: boolean;
}

/**
 * Mirrors `ReorderCategoriesRequest`. The set of ids must exactly match the full set of existing
 * categories, in the desired order (see `admin.category_order_mismatch`) — enforced
 * backend-side, not validated here.
 */
export interface ReorderAdminCategoriesRequest {
  orderedIds: string[];
}
