import { isTmreTown, normalizeTownName, townForZip } from '@/lib/tmre-towns'

export type VisitorLocation = {
  town: string | null
  postal: string | null
  /** True when postal came from the user’s confirm/edit override. */
  confirmed?: boolean
  /** True when the visitor cleared ZIP — do not fall back to IP inference. */
  cleared?: boolean
}

const POSTAL_OVERRIDE_KEY = 'tmre_visitor_postal_override'
const POSTAL_CLEARED_KEY = 'tmre_visitor_postal_cleared'
const GLOW_DISMISSED_KEY = 'tmre_zip_pill_glow_dismissed'
export const VISITOR_LOCATION_CHANGED_EVENT = 'tmre-visitor-location'

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

function normalizePostal(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '').slice(0, 5)
  return digits.length === 5 ? digits : null
}

export function readVisitorPostalOverride(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizePostal(window.localStorage.getItem(POSTAL_OVERRIDE_KEY))
  } catch {
    return null
  }
}

function readVisitorPostalCleared(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(POSTAL_CLEARED_KEY) === '1'
  } catch {
    return false
  }
}

function writePostalKeys(nextPostal: string | null, cleared: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (nextPostal) {
      window.localStorage.setItem(POSTAL_OVERRIDE_KEY, nextPostal)
      window.localStorage.removeItem(POSTAL_CLEARED_KEY)
    } else {
      window.localStorage.removeItem(POSTAL_OVERRIDE_KEY)
      if (cleared) window.localStorage.setItem(POSTAL_CLEARED_KEY, '1')
      else window.localStorage.removeItem(POSTAL_CLEARED_KEY)
    }
  } catch {
    /* private mode */
  }
}

/** Persist a confirmed ZIP. Updates in-memory cache + notifies listeners. */
export function setVisitorPostalOverride(postal: string): VisitorLocation {
  const nextPostal = normalizePostal(postal)
  writePostalKeys(nextPostal, false)
  const next: VisitorLocation = {
    postal: nextPostal,
    town: townFromPostal(nextPostal),
    confirmed: Boolean(nextPostal),
    cleared: false,
  }
  cached = next
  notifyVisitorLocationChanged()
  return next
}

/** Cancel the ZIP out — no override and no IP fallback until Reset. */
export function clearVisitorPostalOverride(): VisitorLocation {
  writePostalKeys(null, true)
  const next: VisitorLocation = {
    postal: null,
    town: null,
    confirmed: true,
    cleared: true,
  }
  cached = next
  notifyVisitorLocationChanged()
  return next
}

/** Drop override + cleared flag, then re-resolve from IP /api/visitor-town. */
export async function resetVisitorPostalToInferred(): Promise<VisitorLocation> {
  writePostalKeys(null, false)
  clearVisitorLocationCache()
  const next = await fetchVisitorLocation()
  notifyVisitorLocationChanged()
  return next
}

export function isZipPillGlowDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(GLOW_DISMISSED_KEY) === '1'
  } catch {
    return true
  }
}

export function dismissZipPillGlow(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GLOW_DISMISSED_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function notifyVisitorLocationChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(VISITOR_LOCATION_CHANGED_EVENT))
}

export async function fetchVisitorLocation(): Promise<VisitorLocation> {
  if (cached !== undefined) return cached

  if (readVisitorPostalCleared()) {
    cached = { town: null, postal: null, confirmed: true, cleared: true }
    return cached
  }

  const override = readVisitorPostalOverride()
  if (override) {
    cached = {
      postal: override,
      town: townFromPostal(override),
      confirmed: true,
      cleared: false,
    }
    return cached
  }

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
    cached = { town, postal, confirmed: false, cleared: false }
  } catch {
    cached = { town: null, postal: null, confirmed: false, cleared: false }
  }
  return cached
}

export function clearVisitorLocationCache(): void {
  cached = undefined
}

/** Drop memory cache and re-resolve (honors postal override). */
export async function refreshVisitorLocation(): Promise<VisitorLocation> {
  clearVisitorLocationCache()
  return fetchVisitorLocation()
}
