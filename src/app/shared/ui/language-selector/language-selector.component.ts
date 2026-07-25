import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageOption, LanguageService } from '../../services/language.service';

/**
 * Guest-facing language switcher, shared by the desktop header and the
 * mobile Home top row — a single anchored popup panel in both places.
 * Talks to `LanguageService` directly — no inputs/outputs, no component
 * state for the active language.
 */
@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'lang-selector',
    '[class.lang-selector--open]': 'open()',
  },
})
export class LanguageSelectorComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  protected readonly languageService = inject(LanguageService);

  protected readonly open = signal(false);
  protected readonly languages = this.languageService.languages;
  protected readonly current = this.languageService.current;

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected select(option: LanguageOption): void {
    this.languageService.use(option.code);
    this.close(true);
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentMouseDown(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target !== null && !this.elementRef.nativeElement.contains(target)) {
      this.close(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close(true);
  }

  private close(returnFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) {
      this.triggerRef()?.nativeElement.focus();
    }
  }
}
