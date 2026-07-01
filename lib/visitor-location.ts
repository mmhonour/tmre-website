import { isTmreTown, normalizeTownName, townForZip } from '@/lib/tmre-towns'

export type VisitorLocation = {
  town: string | null
  postal: string | null
}

let cached: VisitorLocation | undefined

export function townFromPostal(postal: string | null | undefined): string | null {
  const town = townForZip(postal)
  return town && isTmreTown(town) ? town : null
}

export function matchVisitorTownToOptions<T extends string>(
  town: string | null | undefined,
  validValues: readonly T[],
): T | null {
  const normalized = normalizeTownName(town)
  if (!normalized) return null
  return (
    validValues.find((v) => v.toLowerCase() === normalized.toLowerCase()) ?? null
  )
}

export async function fetchVisitorLocation(): Promise<VisitorLocation> {
  if (cached !== undefined) return cached
  try {
    const res = await fetch('/api/visitor-town', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { town?: string | null; postal?: string | null }
    const postal =
      typeof data.postal === 'string' && data.postal.trim()
        ? data.postal.trim().slice(0, 5)
        : null
    const town =
      (typeof data.town === 'string' && data.town.trim() ? data.town.trim() : null) ??
      townFromPostal(postal)
    cached = { town, postal }
  } catch {
    cached = { town: null, postal: null }
  }
  return cached
}

export function clearVisitorLocationCache(): void {
  cached = undefined
}
