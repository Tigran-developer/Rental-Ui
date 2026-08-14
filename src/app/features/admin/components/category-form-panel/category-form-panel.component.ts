import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
} from '../../models/category-palette.model';

/**
 * The shared field block from the design's create panel / edit row / mobile edit sheet: a
 * live colour+icon preview tile, a name input, and the icon + colour picker grids. Fully
 * controlled (name/iconName/colorHex are inputs, every edit is emitted up) so the same
 * markup drives the desktop inline create panel, the desktop inline edit row, and the
 * mobile edit bottom sheet (`CategoryEditSheetComponent`).
 *
 * Deliberately owns no Cancel/Confirm buttons: the design places them inline next to the
 * name input on desktop (create panel / edit row) but full-width below the colour grid on
 * the mobile sheet — different enough layouts that each caller renders its own footer
 * rather than this component forcing one shape via content projection.
 */
@Component({
  selector: 'app-category-form-panel',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './category-form-panel.component.html',
  styleUrl: './category-form-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormPanelComponent {
  readonly name = input<string>('');
  readonly iconName = input<string>(DEFAULT_CATEGORY_ICON);
  readonly colorHex = input<string>(DEFAULT_CATEGORY_COLOR);
  readonly busy = input<boolean>(false);
  readonly nameErrorMessage = input<string | null>(null);
  readonly namePlaceholder = input<string>('');
  readonly autoFocusName = input<boolean>(true);

  readonly nameChange = output<string>();
  readonly iconChange = output<string>();
  readonly colorChange = output<string>();
  /** Enter pressed in the name field with a non-empty value — the caller decides whether
   *  that means "submit". */
  readonly submitName = output<void>();

  protected readonly icons = CATEGORY_ICON_OPTIONS;
  protected readonly colors = CATEGORY_COLOR_OPTIONS;

  protected onNameInput(event: Event): void {
    this.nameChange.emit((event.target as HTMLInputElement).value);
  }

  protected onNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !this.busy() && this.name().trim().length > 0) {
      event.preventDefault();
      this.submitName.emit();
    }
  }
}
