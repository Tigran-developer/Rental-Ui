import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type PageHeaderAlign = 'start' | 'center';
export type PageHeaderSpacing = 'compact' | 'comfortable';
export type PageHeaderMobileTitleAlign = 'center' | 'start';

@Component({
  selector: 'app-ui-page-header',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ph-back-host]': '!!backLink()',
    '[class.ph--hide-on-desktop]': 'hideOnDesktop()',
    '[class.ph--hide-title-desktop-host]': 'hideTitleOnDesktop()',
  },
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly eyebrow = input<string>('');
  readonly backLink = input<string>('');
  readonly align = input<PageHeaderAlign>('start');
  readonly spacing = input<PageHeaderSpacing>('comfortable');
  readonly mobileTitleAlign = input<PageHeaderMobileTitleAlign>('center');
  readonly hideTitleOnDesktop = input<boolean>(false);
  readonly hideOnDesktop = input<boolean>(false);

  protected readonly hostClasses = computed(() => ({
    'ph': true,
    [`ph--${this.align()}`]: true,
    [`ph--${this.spacing()}`]: true,
    'ph--has-back': !!this.backLink(),
    'ph--mobile-title-start': this.mobileTitleAlign() === 'start',
    'ph--hide-desktop-title': this.hideTitleOnDesktop(),
  }));
}
