/**
 * Structured listing-rejection reasons. Single source of truth for the
 * Phase-1 review (pending-listings-page) and inspect screens — codes must
 * stay in sync with `RejectionReasonCatalog` (rental-api
 * `Application/Common/RejectionReasonCatalog.cs`); titles/descriptions live in
 * i18n under `admin.pendingListings.rejectSheet.reasons.<key>`.
 */
export interface RejectReason {
  readonly key: string;
  readonly icon: string;
}

export const REJECT_REASONS: readonly RejectReason[] = [
  { key: 'poorImages', icon: 'pi pi-image' },
  { key: 'missingInfo', icon: 'pi pi-file' },
  { key: 'duplicate', icon: 'pi pi-copy' },
  { key: 'inappropriate', icon: 'pi pi-ban' },
  { key: 'wrongCategory', icon: 'pi pi-tag' },
  { key: 'unsafeItem', icon: 'pi pi-exclamation-triangle' },
  { key: 'hygiene', icon: 'pi pi-heart' },
  { key: 'pricing', icon: 'pi pi-dollar' },
  { key: 'other', icon: 'pi pi-question-circle' },
];
