export const NEW_CONSTRUCTION_MIN_YEAR = new Date().getFullYear() - 4

const NEW_CONSTRUCTION_KEYWORDS = [
  'new construction',
  'newly constructed',
  'new build',
  'newly built',
  'never occupied',
  'to be completed',
]

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
