import { normalizeStreetLine } from '@/lib/property-address'

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

/** Admin-only owner aggregation (Streets password). Optional street scope. */
export function visionOwnersPageHref(
  town: string,
  streetName?: string | null,
): string {
  const params = new URLSearchParams({ town: town.trim() })
  const street = streetName?.trim()
  if (street) params.set('street', street)
  return `/streets/owners?${params.toString()}`
}

export function visionStreetPageHref(
  town: string,
  streetName: string,
  visionPid?: string | null,
): string {
  const path = `/streets/${townToStreetSlug(town)}/${streetNameToSlug(streetName)}`
  const pid = visionPid?.trim()
  return pid ? `${path}#pid-${encodeURIComponent(pid)}` : path
}

/**
 * TMRE Vision / VGSI parcel page — the reverse of `visionStreetPageHref`.
 * Westport has `/find/westport/{pid}`. Other towns fall back to Find search
 * until they get their own parcel route.
 */
export function visionParcelFindHref(
  town: string,
  visionPid: string,
  addressLabel?: string,
): string {
  const pid = visionPid.trim()
  if (town.trim().toLowerCase() === 'westport' && pid) {
    return `/find/westport/${encodeURIComponent(pid)}`
  }
  const q = addressLabel?.trim()
  return q ? `/find?q=${encodeURIComponent(q)}` : '/find'
}

/** `locust-lane` and `Locust Ln` both key to `locust-ln`. Case ignored. */
export function streetNameMatchSlug(streetName: string): string {
  return streetNameToSlug(normalizeStreetLine(streetName.replace(/-/g, ' ')))
}

export function resolveStreetName(
  slug: string,
  knownStreets: readonly string[],
): string | null {
  const canon = streetNameMatchSlug(slug)
  if (canon) {
    const byAbbrev = knownStreets.find(
      (name) => streetNameMatchSlug(name) === canon,
    )
    if (byAbbrev) return byAbbrev
  }
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
