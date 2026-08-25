/**
 * Pure MLS status helpers — safe for client components.
 * Keep out of listings-store (server-only / RETS).
 */

/**
 * True for under-agreement MLS rows. SmartMLS exposes two under-contract
 * statuses (from the Property/Status lookup):
 *   D  · UC     · "Under Contract"
 *   SH · UC-CTS · "Under Contract - Continue to Show"
 * RESO also uses ActiveUnderContract / Pending-adjacent labels. We match the
 * long labels, short values, raw codes, and substring forms so this holds
 * regardless of which representation a row carries.
 */
export function isUnderContractStatus(
  status: string | null | undefined,
): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  if (!s) return false;
  if (
    s === "under contract" ||
    s === "under contract - continue to show" ||
    s === "under contract - cts" ||
    s === "uc" ||
    s === "uc-cts" ||
    s === "d" ||
    s === "sh" ||
    s === "cts" ||
    s === "auc" ||
    s === "activeundercontract" ||
    s === "active under contract" ||
    s === "active-under-contract"
  ) {
    return true;
  }
  return (
    s.includes("under contract") ||
    s.includes("undercontract") ||
    s.includes("continue to show") ||
    s.includes("continue-to-show")
  );
}

/**
 * True only for MLS Active (code A). Featured homepage picks (DOTD / DOTW)
 * must pass this — not Coming Soon, Under Contract, or Continue to Show.
 */
export function isStrictlyActiveStatus(
  status: string | null | undefined,
): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  if (!s) return false;
  if (isUnderContractStatus(status)) return false;
  return s === "active" || s === "a";
}

function isPendingClosedOrExpiredStatus(
  status: string | null | undefined,
): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  if (!s) return false;
  return (
    s === "pending" ||
    s === "p" ||
    s === "closed" ||
    s === "c" ||
    s === "expired" ||
    s === "x" ||
    s === "withdrawn" ||
    s === "w" ||
    s === "hold" ||
    s === "h" ||
    s.includes("temp off")
  );
}

function rawStatusString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export type FeaturedDealStatusSource = {
  status?: string | null;
  raw?: {
    StandardStatus?: unknown;
    MLSStatus?: unknown;
  } | null;
};

/**
 * Homepage / featured deal gate. The coalesced `status` must be MLS Active,
 * and no status field may say Under Contract, Continue to Show, Pending, or
 * closed — RESO StandardStatus often moves first while MLSStatus stays Active.
 */
export function listingIsFeaturedDealEligible(
  listing: FeaturedDealStatusSource | null | undefined,
): boolean {
  if (!listing) return false;
  const signals = [
    listing.status,
    rawStatusString(listing.raw?.StandardStatus),
    rawStatusString(listing.raw?.MLSStatus),
  ];
  if (
    signals.some(
      (s) => isUnderContractStatus(s) || isPendingClosedOrExpiredStatus(s),
    )
  ) {
    return false;
  }
  return isStrictlyActiveStatus(listing.status);
}

/**
 * Short Intelligence-board pill label for under-contract MLS status, or null
 * when the listing is not under contract.
 */
export function underContractStatusLabel(
  status: string | null | undefined,
): string | null {
  if (!isUnderContractStatus(status)) return null;
  const s = status!.trim().toLowerCase();
  if (
    s.includes("continue to show") ||
    s.includes("continue-to-show") ||
    s === "uc-cts" ||
    s === "cts" ||
    s === "sh"
  ) {
    return "Continue to Show";
  }
  return "Under Contract";
}
