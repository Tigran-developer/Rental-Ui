import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface AdminTabItem {
  readonly id: string;
  readonly labelKey: string;
  readonly count?: number | null;
}

/**
 * Admin console segmented tab control — the design's `AdminTabs`: a pill
 * container with a dark "active" pill and a count chip per tab. Implements
 * the WAI-ARIA tabs pattern (roving tabindex, arrow-key navigation) even
 * though — in Phase 0 — no consumer wires it to a tabpanel yet.
 */
@Component({
  selector: 'app-admin-tabs',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-tabs.component.html',
  styleUrl: './admin-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTabsComponent {
  readonly tabs = input.required<AdminTabItem[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input<string>('');

  readonly valueChange = output<string>();

  @ViewChildren('tabButton')
  private readonly tabButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  protected isActive(tab: AdminTabItem): boolean {
    return tab.id === this.value();
  }

  protected hasCount(tab: AdminTabItem): boolean {
    return tab.count !== undefined && tab.count !== null;
  }

  protected select(id: string): void {
    if (id !== this.value()) {
      this.valueChange.emit(id);
    }
  }

  /** Roving-focus arrow-key navigation per the WAI-ARIA tabs pattern. */
  protected onKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    if (tabs.length === 0) {
      return;
    }

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    this.valueChange.emit(nextTab.id);
    this.focusTabAt(nextIndex);
  }

  private focusTabAt(index: number): void {
    const button = this.tabButtons?.toArray()[index]?.nativeElement;
    button?.focus();
  }
}
