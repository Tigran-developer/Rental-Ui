/**
 * Maps a known `admin.category_*` `ServiceError` code (see `api/api-error.model.ts`) to its
 * translated, admin-facing message key. Used wherever a category mutation error needs a
 * clean localized sentence instead of the raw (English-only, backend `title`) error text —
 * e.g. the delete dialog's reassign-required/-invalid states.
 */
const CATEGORY_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  'admin.category_name_taken': 'admin.categories.errors.nameTaken',
  'admin.category_invalid_name': 'admin.categories.errors.invalidName',
  'admin.category_invalid_color': 'admin.categories.errors.invalidColor',
  'admin.category_order_mismatch': 'admin.categories.errors.orderMismatch',
  'admin.category_reassign_required': 'admin.categories.errors.reassignRequired',
  'admin.category_reassign_invalid': 'admin.categories.errors.reassignInvalid',
  'admin.category_not_found': 'admin.categories.errors.notFound',
  'admin.category_reassign_target_not_found': 'admin.categories.errors.reassignTargetNotFound',
};

/** `null` when `errorCode` is `null` or isn't one of the known category codes above — callers
 *  should fall back to the raw error message from the store in that case. */
export function categoryErrorMessageKey(errorCode: string | null): string | null {
  if (errorCode === null) return null;
  return CATEGORY_ERROR_MESSAGE_KEYS[errorCode] ?? null;
}
