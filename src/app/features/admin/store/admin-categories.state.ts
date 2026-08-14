import type { AdminCategoriesSummary, AdminCategory } from '../models/admin-category.model';

/**
 * Snapshot stashed when an optimistic mutation (create/rename/restyle/visibility) is
 * dispatched, so a failure can put `items`/`summary` back exactly where they were.
 * `item: null` means the row didn't exist before this op (create) — on rollback it's
 * removed rather than restored. Mirrors `AdminModerationRollbackEntry`'s idiom.
 */
export interface AdminCategoriesRollbackEntry {
  readonly item: AdminCategory | null;
  readonly summary: AdminCategoriesSummary;
}

export interface AdminCategoriesState {
  readonly items: AdminCategory[];
  readonly summary: AdminCategoriesSummary;
  readonly isLoading: boolean;
  readonly error: string | null;

  // ── Create (optimistic: a placeholder row is keyed by a client-generated tempId) ──
  readonly isCreating: boolean;
  readonly createError: string | null;
  readonly createErrorCode: string | null;

  // ── Rename / restyle / visibility (optimistic patch, keyed by the real category id) ──
  readonly actionIds: string[];
  readonly rollbacks: Record<string, AdminCategoriesRollbackEntry>;
  readonly editErrorCodeById: Record<string, string | null>;

  // ── Reorder (optimistic; always sends the full ordered id list) ──
  readonly isReordering: boolean;
  readonly reorderError: string | null;
  readonly savedOrder: string[] | null;

  // ── Delete (non-optimistic — the confirm dialog stays open with a spinner until settled) ──
  readonly deletingId: string | null;
  readonly deleteError: string | null;
  readonly deleteErrorCode: string | null;
}

export const initialAdminCategoriesSummary: AdminCategoriesSummary = {
  totalCategories: 0,
  visibleCount: 0,
  totalListedToys: 0,
};

export const initialAdminCategoriesState: AdminCategoriesState = {
  items: [],
  summary: initialAdminCategoriesSummary,
  isLoading: false,
  error: null,

  isCreating: false,
  createError: null,
  createErrorCode: null,

  actionIds: [],
  rollbacks: {},
  editErrorCodeById: {},

  isReordering: false,
  reorderError: null,
  savedOrder: null,

  deletingId: null,
  deleteError: null,
  deleteErrorCode: null,
};
