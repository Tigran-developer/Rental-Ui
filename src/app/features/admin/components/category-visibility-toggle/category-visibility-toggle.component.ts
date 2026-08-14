import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The design's visibility toggle (`AdminCategoriesDesktop`/`Mobile`'s pill switch): a real
 * `role="switch"` button, not a styled `<div>`, per the a11y non-negotiable. Hiding a
 * category only removes it from the renter-facing category list/filter — its listings stay
 * visible everywhere else (browse, search, map, home) — see the "Visible"/"Hidden" copy keys
 * this reads, which spell that out.
 */
@Component({
  selector: 'app-category-visibility-toggle',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './category-visibility-toggle.component.html',
  styleUrl: './category-visibility-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryVisibilityToggleComponent {
  readonly checked = input.required<boolean>();
  readonly disabled = input<boolean>(false);
  readonly toggle = output<void>();

  protected onClick(): void {
    if (this.disabled()) return;
    this.toggle.emit();
  }
}
