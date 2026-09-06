/**
 * Closed RETS window around a Vision last-deed date.
 *
 * SmartMLS will not return old Closed rows on an address-only search — it
 * needs a StatusChangeTimestamp range (same reason bulk closed sync uses
 * year windows). A 2018 sale is outside CLOSED_LISTINGS_SINCE (2019), so
 * Find has to ask for that year explicitly.
 */
export function closedSearchWindowForSaleDate(
  lastSaleDate: string | null | undefined,
  now = new Date(),
): { closedAfter: string; closedBefore: string } {
  const today = now.toISOString().slice(0, 10)
  const match = lastSaleDate?.trim().match(/^(\d{4})-\d{2}-\d{2}/)
  if (match) {
    const year = Number(match[1])
    if (Number.isFinite(year) && year >= 1990 && year <= 2100) {
      return {
        closedAfter: `${year - 1}-01-01`,
        closedBefore: `${Math.min(year + 1, now.getUTCFullYear() + 1)}-12-31`,
      }
    }
  }
  return { closedAfter: '2000-01-01', closedBefore: today }
}
