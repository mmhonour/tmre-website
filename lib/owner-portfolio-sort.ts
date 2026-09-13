import type { VisionOwnerPortfolioParcel } from '@/lib/vision-owner-keys'

export type OwnerPurchaseSortKey = 'date' | 'amount'
export type OwnerPurchaseSortDir = 'asc' | 'desc'

/** Vision last-paid stamps are `MM/DD/YYYY`. Do not sort the printed string. */
export function parseOwnerPurchaseDateMs(
  value: string | null | undefined,
): number | null {
  if (!value) return null
  const trimmed = value.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (m) {
    const month = Number(m[1])
    const day = Number(m[2])
    const year = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return Date.UTC(year, month - 1, day)
  }
  const ms = Date.parse(trimmed)
  return Number.isNaN(ms) ? null : ms
}

export function nextOwnerPurchaseSort(
  currentKey: OwnerPurchaseSortKey | null,
  currentDir: OwnerPurchaseSortDir,
  clicked: OwnerPurchaseSortKey,
): { key: OwnerPurchaseSortKey; dir: OwnerPurchaseSortDir } {
  if (currentKey === clicked) {
    return { key: clicked, dir: currentDir === 'asc' ? 'desc' : 'asc' }
  }
  return { key: clicked, dir: 'desc' }
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: OwnerPurchaseSortDir,
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a - b : b - a
}

export function sortOwnerPortfolioParcels(
  parcels: readonly VisionOwnerPortfolioParcel[],
  key: OwnerPurchaseSortKey | null,
  dir: OwnerPurchaseSortDir,
): VisionOwnerPortfolioParcel[] {
  const next = [...parcels]
  if (!key) return next
  return next.sort((a, b) => {
    const cmp =
      key === 'date'
        ? compareNullableNumber(
            parseOwnerPurchaseDateMs(a.lastPaidSaleDate),
            parseOwnerPurchaseDateMs(b.lastPaidSaleDate),
            dir,
          )
        : compareNullableNumber(a.lastPaidPrice, b.lastPaidPrice, dir)
    if (cmp !== 0) return cmp
    return a.siteAddress.localeCompare(b.siteAddress)
  })
}
