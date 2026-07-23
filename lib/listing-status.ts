/**
 * Pure MLS status helpers — safe for client components.
 * Keep out of listings-store (server-only / RETS).
 */

/**
 * True for under-agreement MLS rows. SmartMLS exposes two under-contract
 * statuses (from the Property/Status lookup):
 *   D  · UC     · "Under Contract"
 *   SH · UC-CTS · "Under Contract - Continue to Show"
 * We match the long labels (as returned in `status`), short values, and raw
 * codes so this holds regardless of which representation a row carries.
 */
export function isUnderContractStatus(
  status: string | null | undefined,
): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  if (!s) return false;
  return (
    s === "under contract" ||
    s === "under contract - continue to show" ||
    s === "under contract - cts" ||
    s === "uc" ||
    s === "uc-cts" ||
    s === "d" ||
    s === "sh" ||
    s.includes("under contract")
  );
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
    s === "sh"
  ) {
    return "Continue to Show";
  }
  return "Under Contract";
}
