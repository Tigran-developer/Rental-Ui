import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DorentSymbolComponent } from '../dorent-symbol/dorent-symbol.component';

/**
 * Mobile-only app-open loading screen. A full-viewport `--ui-color-background`
 * field (the same colour as the `index.html` anti-flash rule, so there is no
 * seam between pre-boot paint and this overlay) with the animated brand mark
 * centred on it.
 *
 * The host owns visibility via `visible()` rather than being conditionally
 * rendered with `@if` in the parent, so hiding it can fade out over ~200ms
 * instead of cutting — see `app.ts`'s `showBootScreen` gating for when
 * `visible` flips to false.
 */
@Component({
  selector: 'app-ui-boot-screen',
  standalone: true,
  imports: [DorentSymbolComponent, TranslatePipe],
  templateUrl: './boot-screen.component.html',
  styleUrl: './boot-screen.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dr-boot',
    role: 'status',
    'aria-live': 'polite',
    '[attr.aria-busy]': 'visible()',
    '[class.dr-boot--hidden]': '!visible()',
  },
})
export class BootScreenComponent {
  readonly visible = input<boolean>(true);
}
