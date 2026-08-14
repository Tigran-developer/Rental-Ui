import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import type { AdminListingDetail } from '../../models/admin-listing-queue.model';

/**
 * The design's owner-trust panel (`AdminInspectDesktop`'s right-rail card /
 * `AdminInspectMobile`'s owner card). "Message owner" is relabelled to a
 * link to the owner's public profile — an admin has no booking with this
 * owner, so the design's booking-scoped chat action can't work as drawn
 * (approved deviation, see inspect-page's doc comment for the full note).
 */
@Component({
  selector: 'app-owner-trust-panel',
  standalone: true,
  imports: [AvatarComponent, DatePipe, IconComponent, RouterLink, TranslatePipe],
  templateUrl: './owner-trust-panel.component.html',
  styleUrl: './owner-trust-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerTrustPanelComponent {
  readonly listing = input.required<AdminListingDetail>();
  readonly isDesktop = input<boolean>(true);

  protected readonly ownerName = computed(() => {
    const l = this.listing();
    return `${l.ownerFirstName} ${l.ownerLastName}`.trim();
  });

  protected readonly ownerProfilePath = computed<[string, string]>(() => [
    '/users',
    this.listing().ownerId,
  ]);
}
