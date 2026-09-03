/** Client-safe helpers for the Admin /streets page. */

export function townToStreetSlug(town: string): string {
  return town
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveStreetTown(
  slug: string,
  knownTowns: readonly string[],
): string | null {
  const needle = townToStreetSlug(slug)
  if (!needle) return null
  return knownTowns.find((town) => townToStreetSlug(town) === needle) ?? null
}

export function streetNameToSlug(streetName: string): string {
  return townToStreetSlug(streetName)
}

export function resolveStreetName(
  slug: string,
  knownStreets: readonly string[],
): string | null {
  const needle = streetNameToSlug(slug)
  if (!needle) return null
  return (
    knownStreets.find((name) => streetNameToSlug(name) === needle) ?? null
  )
}

/** Sort 5 Locust Ln before 12 Locust Ln before a label with no number. */
export function compareAddressLabels(a: string, b: string): number {
  const num = (label: string): number => {
    const m = label.trim().match(/^(\d+)/)
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
  }
  const d = num(a) - num(b)
  if (d !== 0) return d
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}
