import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';

import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { AdminPageHeaderComponent } from '../../components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../components/admin-stat-card/admin-stat-card.component';
import { CategoryDeleteDialogComponent } from '../../components/category-delete-dialog/category-delete-dialog.component';
import { CategoryEditSheetComponent } from '../../components/category-edit-sheet/category-edit-sheet.component';
import { CategoryFormPanelComponent } from '../../components/category-form-panel/category-form-panel.component';
import { CategoryVisibilityToggleComponent } from '../../components/category-visibility-toggle/category-visibility-toggle.component';
import type { AdminCategory } from '../../models/admin-category.model';
import { DEFAULT_CATEGORY_COLOR, DEFAULT_CATEGORY_ICON } from '../../models/category-palette.model';
import * as AdminCategoriesActions from '../../store/admin-categories.actions';
import {
  selectCategories,
  selectCategoriesError,
  selectCategoriesLoading,
  selectCategoriesSummary,
  selectCategoryActionIds,
  selectCreateErrorCode,
  selectDeleteError,
  selectDeleteErrorCode,
  selectDeletingId,
  selectEditErrorCodeById,
  selectIsCreatingCategory,
  selectIsReordering,
} from '../../store/admin-categories.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';
import { categoryErrorMessageKey } from '../../utils/category-error-message.util';

/**
 * `/admin/categories` — the redesigned category taxonomy screen
 * (`AdminCategoriesDesktop` / `AdminCategoriesMobile`). Replaces the placeholder page.
 *
 * Create / rename-restyle panels are the shared `CategoryFormPanelComponent` (fields only);
 * this page owns the Cancel/Confirm buttons around it since their layout differs between the
 * desktop inline panel/row and the mobile bottom sheet. Auto-close-on-success for the create
 * panel, the edit row/sheet, and the delete dialog is done with a small "did we submit, and
 * has the store settled" `effect()` per flow, guarded by a local `*Submitted` flag so opening
 * a panel (before any submit) never gets mistaken for "just settled with no error".
 */
@Component({
  selector: 'app-categories-page',
  standalone: true,
  imports: [
    AdminPageHeaderComponent,
    AdminStatCardComponent,
    CategoryDeleteDialogComponent,
    CategoryEditSheetComponent,
    CategoryFormPanelComponent,
    CategoryVisibilityToggleComponent,
    EmptyStateComponent,
    IconComponent,
    MessageModule,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './categories-page.component.html',
  styleUrl: './categories-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly translate = inject(TranslateService);

  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  // ── Store state ──
  protected readonly categories = this.store.selectSignal(selectCategories);
  protected readonly summary = this.store.selectSignal(selectCategoriesSummary);
  protected readonly isLoading = this.store.selectSignal(selectCategoriesLoading);
  protected readonly error = this.store.selectSignal(selectCategoriesError);
  protected readonly isCreating = this.store.selectSignal(selectIsCreatingCategory);
  protected readonly createErrorCode = this.store.selectSignal(selectCreateErrorCode);
  protected readonly categoryActionIds = this.store.selectSignal(selectCategoryActionIds);
  protected readonly editErrorCodeById = this.store.selectSignal(selectEditErrorCodeById);
  protected readonly storeDeletingId = this.store.selectSignal(selectDeletingId);
  protected readonly deleteError = this.store.selectSignal(selectDeleteError);
  protected readonly deleteErrorCode = this.store.selectSignal(selectDeleteErrorCode);
  protected readonly isReordering = this.store.selectSignal(selectIsReordering);

  protected readonly defaultIcon = DEFAULT_CATEGORY_ICON;
  protected readonly defaultColor = DEFAULT_CATEGORY_COLOR;

  /**
   * Two-form pluralisation idiom (see `CategoryDeleteDialogComponent.hasListingsKey`) —
   * ngx-translate has no ICU/plural-rules support, so the singular case gets its own key
   * per locale rather than reusing the `{{count}}`-interpolated "N listings" string for N=1.
   */
  protected listingCountKey(count: number): string {
    return count === 1
      ? 'admin.categories.card.listingCountOne'
      : 'admin.categories.card.listingCount';
  }

  protected readonly showInitialSkeleton = computed(
    () => this.isLoading() && this.categories().length === 0,
  );
  protected readonly showEmpty = computed(
    () =>
      !this.isLoading() &&
      this.categories().length === 0 &&
      this.error() === null &&
      !this.showInitialSkeleton(),
  );
  /** Stat cards show their built-in skeleton until the first load settles. */
  protected readonly statsReady = computed(() => !this.showInitialSkeleton());

  // ── Create panel ──
  protected readonly adding = signal(false);
  protected readonly newName = signal('');
  protected readonly newIcon = signal(DEFAULT_CATEGORY_ICON);
  protected readonly newColor = signal(DEFAULT_CATEGORY_COLOR);
  private readonly createSubmitted = signal(false);

  protected readonly createNameErrorMessage = computed<string | null>(() => {
    const code = this.createErrorCode();
    if (code !== 'admin.category_name_taken') return null;
    return this.translate.instant('admin.categories.errors.nameTaken');
  });

  // ── Rename / restyle ──
  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editIcon = signal(DEFAULT_CATEGORY_ICON);
  protected readonly editColor = signal(DEFAULT_CATEGORY_COLOR);
  private readonly editSubmitted = signal(false);

  protected readonly editNameErrorMessage = computed<string | null>(() => {
    const id = this.editingId();
    if (id === null) return null;
    const code = this.editErrorCodeById()[id];
    if (code !== 'admin.category_name_taken') return null;
    return this.translate.instant('admin.categories.errors.nameTaken');
  });

  // ── Delete ──
  protected readonly deletingCategory = signal<AdminCategory | null>(null);
  private readonly deleteSubmitted = signal(false);

  protected readonly deleteOtherCategories = computed<AdminCategory[]>(() => {
    const current = this.deletingCategory();
    if (current === null) return [];
    return this.categories().filter((c) => c.id !== current.id);
  });

  protected readonly deleteDialogBusy = computed(() => {
    const current = this.deletingCategory();
    return current !== null && this.storeDeletingId() === current.id;
  });

  protected readonly deleteDialogErrorMessage = computed<string | null>(() => {
    const current = this.deletingCategory();
    if (current === null) return null;
    const code = this.deleteErrorCode();
    const messageKey = categoryErrorMessageKey(code);
    if (messageKey !== null) return this.translate.instant(messageKey);
    return this.deleteError();
  });

  constructor() {
    // Create panel: auto-close once a submitted create settles without an error.
    effect(() => {
      if (!this.adding() || !this.createSubmitted()) return;
      if (this.isCreating()) return;
      if (this.createErrorCode() === null) {
        this.adding.set(false);
      }
      this.createSubmitted.set(false);
    });

    // Edit row/sheet: auto-close once a submitted rename/restyle settles without an error.
    effect(() => {
      const id = this.editingId();
      if (id === null || !this.editSubmitted()) return;
      if (this.categoryActionIds().includes(id)) return;
      if (!this.editErrorCodeById()[id]) {
        this.editingId.set(null);
      }
      this.editSubmitted.set(false);
    });

    // Delete dialog: auto-close once a submitted delete settles without an error. A partial
    // failure on the create-then-delete "new category" path also leaves `deleteError` set, so
    // the dialog correctly stays open (with an accurate error) instead of claiming success.
    effect(() => {
      const category = this.deletingCategory();
      if (category === null || !this.deleteSubmitted()) return;
      if (this.storeDeletingId() === category.id) return;
      if (this.deleteError() === null) {
        this.deletingCategory.set(null);
      }
      this.deleteSubmitted.set(false);
    });
  }

  ngOnInit(): void {
    this.store.dispatch(AdminCategoriesActions.loadCategories());
  }

  protected retry(): void {
    this.store.dispatch(AdminCategoriesActions.loadCategories());
  }

  // ── Create ──
  protected toggleCreate(): void {
    if (this.adding()) {
      this.cancelCreate();
    } else {
      this.openCreate();
    }
  }

  private openCreate(): void {
    this.editingId.set(null);
    this.adding.set(true);
    this.newName.set('');
    this.newIcon.set(DEFAULT_CATEGORY_ICON);
    this.newColor.set(DEFAULT_CATEGORY_COLOR);
    this.createSubmitted.set(false);
    this.store.dispatch(AdminCategoriesActions.clearCreateError());
  }

  protected cancelCreate(): void {
    this.adding.set(false);
    this.createSubmitted.set(false);
    this.store.dispatch(AdminCategoriesActions.clearCreateError());
  }

  protected submitCreate(): void {
    const name = this.newName().trim();
    if (name.length === 0 || this.isCreating()) return;
    this.createSubmitted.set(true);
    this.store.dispatch(
      AdminCategoriesActions.createCategory({
        tempId:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        request: { name, iconName: this.newIcon(), colorHex: this.newColor() },
      }),
    );
  }

  // ── Rename / restyle ──
  protected startEdit(category: AdminCategory): void {
    this.adding.set(false);
    this.editingId.set(category.id);
    this.editName.set(category.name);
    this.editIcon.set(category.iconName ?? DEFAULT_CATEGORY_ICON);
    this.editColor.set(category.colorHex ?? DEFAULT_CATEGORY_COLOR);
    this.editSubmitted.set(false);
    this.store.dispatch(AdminCategoriesActions.clearEditError({ id: category.id }));
  }

  protected cancelEdit(): void {
    const id = this.editingId();
    if (id !== null) this.store.dispatch(AdminCategoriesActions.clearEditError({ id }));
    this.editingId.set(null);
    this.editSubmitted.set(false);
  }

  protected confirmEdit(): void {
    const id = this.editingId();
    const name = this.editName().trim();
    if (id === null || name.length === 0 || this.categoryActionIds().includes(id)) return;
    this.editSubmitted.set(true);
    this.store.dispatch(
      AdminCategoriesActions.updateCategory({
        id,
        request: { name, iconName: this.editIcon(), colorHex: this.editColor() },
      }),
    );
  }

  protected isEditBusy(id: string): boolean {
    return this.categoryActionIds().includes(id);
  }

  // ── Visibility ──
  protected toggleVisibility(category: AdminCategory): void {
    if (this.categoryActionIds().includes(category.id)) return;
    this.store.dispatch(
      AdminCategoriesActions.updateVisibility({ id: category.id, isVisible: !category.isVisible }),
    );
  }

  // ── Reorder (always sends the full ordered id list — see admin.category_order_mismatch) ──
  protected moveUp(index: number): void {
    this.reorder(index, index - 1);
  }

  protected moveDown(index: number): void {
    this.reorder(index, index + 1);
  }

  protected reorder(fromIndex: number, toIndex: number): void {
    const items = this.categories();
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const next = [...items];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    this.store.dispatch(
      AdminCategoriesActions.reorderCategories({ orderedIds: next.map((c) => c.id) }),
    );
  }

  // ── Delete ──
  protected startDelete(category: AdminCategory): void {
    this.editingId.set(null);
    this.deletingCategory.set(category);
    this.deleteSubmitted.set(false);
    this.store.dispatch(AdminCategoriesActions.clearDeleteError({ id: category.id }));
  }

  protected cancelDelete(): void {
    this.deletingCategory.set(null);
    this.deleteSubmitted.set(false);
  }

  protected confirmDeleteSimple(): void {
    const category = this.deletingCategory();
    if (category === null) return;
    this.deleteSubmitted.set(true);
    this.store.dispatch(AdminCategoriesActions.deleteCategory({ id: category.id }));
  }

  protected confirmDeleteExisting(targetId: string): void {
    const category = this.deletingCategory();
    if (category === null) return;
    this.deleteSubmitted.set(true);
    this.store.dispatch(
      AdminCategoriesActions.deleteCategory({
        id: category.id,
        reassignToCategoryId: targetId,
      }),
    );
  }

  protected confirmDeleteNew(newName: string): void {
    const category = this.deletingCategory();
    if (category === null || newName.trim().length === 0) return;
    this.deleteSubmitted.set(true);
    this.store.dispatch(
      AdminCategoriesActions.deleteCategoryToNewCategory({
        id: category.id,
        newCategory: {
          name: newName.trim(),
          iconName: DEFAULT_CATEGORY_ICON,
          colorHex: DEFAULT_CATEGORY_COLOR,
        },
      }),
    );
  }
}
