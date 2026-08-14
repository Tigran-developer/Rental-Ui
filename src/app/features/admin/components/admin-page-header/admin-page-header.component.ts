import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Admin console page header — the design's `AdminHeader`: title, optional
 * subtitle, and a right-hand action slot (`ng-content`) for a page's
 * primary CTA (e.g. "Add category"). Distinct from `shared/ui/page-header`,
 * which drives the public-site page chrome (back link, hero alignment) and
 * is not part of this console's visual language.
 */
@Component({
  selector: 'app-admin-page-header',
  standalone: true,
  templateUrl: './admin-page-header.component.html',
  styleUrl: './admin-page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
