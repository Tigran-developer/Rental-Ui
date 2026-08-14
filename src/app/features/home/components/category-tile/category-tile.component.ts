import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  input,
} from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { toSafeCategoryColor } from '../../../../shared/utils/category-palette.model';

export interface HomeCategoryTileVm {
  readonly id: string | null;
  readonly slug: string;
  readonly label: string;
  /** Admin-picked icon name (`shared/ui/icon/icon.component.ts`'s `ICONS` keys), already
   *  resolved to `DEFAULT_CATEGORY_ICON` by the caller when the backend value is null/empty. */
  readonly iconName: string;
  /** Admin-picked tile colour, already resolved to `DEFAULT_CATEGORY_COLOR` by the caller
   *  when the backend value is null/empty. Re-validated here (`toSafeCategoryColor`) before
   *  it is rendered into a style binding, since it still comes from the network. */
  readonly colorHex: string;
}

@Component({
  selector: 'app-home-category-tile',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './category-tile.component.html',
  styleUrl: './category-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryTileComponent {
  readonly category = input.required<HomeCategoryTileVm>();

  @Output() readonly select = new EventEmitter<HomeCategoryTileVm>();

  /** The tile's media background — guards against a malformed `colorHex` (anything not
   *  matching `#RRGGBB`/`#RRGGBBAA`) rather than trusting the caller's resolution. */
  protected backgroundColor(): string {
    return toSafeCategoryColor(this.category().colorHex);
  }

  protected onClick(): void {
    this.select.emit(this.category());
  }
}
