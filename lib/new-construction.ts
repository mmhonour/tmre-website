export const NEW_CONSTRUCTION_MIN_YEAR = new Date().getFullYear() - 4

const NEW_CONSTRUCTION_KEYWORDS = [
  'new construction',
  'newly constructed',
  'new build',
  'newly built',
  'never occupied',
  'to be completed',
  'newly completed',
]

const FIRST_SALE_REMARK_RE =
  /never occupied|newly completed|new construction|newly constructed|new build|newly built|spec home/

const RESALE_REMARK_RE = /\bresale\b|no\s*\/?\s*resale|previously sold/

/** Year-built within the rolling 12-month window (year-level approximation). */
export function builtWithinLast12Months(
  yearBuilt: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (yearBuilt == null) return false
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 12)
  return yearBuilt >= cutoff.getFullYear()
}

/** SmartMLS `NewConstructionType` — true = first-sale new build, false = resale. */
export function newConstructionFirstSaleFromMls(
  raw: Record<string, string> | undefined,
): boolean | null {
  const ncType = (raw?.NewConstructionType ?? '').trim().toLowerCase()
  if (!ncType) return null
  if (/no\s*\/?\s*resale|^no$/.test(ncType)) return false
  if (
    /never occupied|under construction|to be built|new construction|completed/.test(
      ncType,
    )
  ) {
    return true
  }
  return null
}

/**
 * New construction completed within ~12 months and not a resale — used for
 * Goldilocks condition scoring (100 unless remarks say otherwise).
 */
export function isFreshFirstSaleNewConstruction(
  input: {
    yearBuilt: number | null | undefined
    propertyType?: string | null
    raw?: Record<string, string>
  },
  remarksHaystack: string,
  now: Date = new Date(),
): boolean {
  if (!builtWithinLast12Months(input.yearBuilt, now)) return false

  const mlsFirstSale = newConstructionFirstSaleFromMls(input.raw)
  if (mlsFirstSale === false) return false

  const hay = `${input.propertyType ?? ''} ${remarksHaystack}`.toLowerCase()
  if (RESALE_REMARK_RE.test(hay)) return false

  if (mlsFirstSale === true) return true
  if (FIRST_SALE_REMARK_RE.test(hay)) return true

  const year = now.getFullYear()
  if (input.yearBuilt != null && input.yearBuilt >= year) return true

  return false
}

/** Client-safe new-construction check (year built + property type only). */
export function matchesNewConstruction(
  yearBuilt: number | null | undefined,
  propertyType?: string | null,
): boolean {
  if (yearBuilt != null && yearBuilt >= NEW_CONSTRUCTION_MIN_YEAR) return true
  const hay = (propertyType ?? '').toLowerCase()
  if (
    /new construction|newly constructed|new build|spec home|to be built|under construction|never occupied/.test(
      hay,
    )
  ) {
    return yearBuilt == null || yearBuilt >= 2015
  }
  if (NEW_CONSTRUCTION_KEYWORDS.some((k) => hay.includes(k))) {
    return yearBuilt == null || yearBuilt >= 2015
  }
  return false
}

export { NEW_CONSTRUCTION_KEYWORDS }
