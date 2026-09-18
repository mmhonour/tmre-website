/** Shared visitor log types (safe for client imports). */

import {
  normalizeZip,
  townForZip,
  zipAreaNickname,
} from '@/lib/tmre-towns'

export type VisitorGeo = {
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  org: string | null
  /** ipapi.co coords — kept so /api/visitor-town can reuse a stored lookup. */
  latitude?: number | null
  longitude?: number | null
}

export type VisitorPageHit = {
  path: string
  at: string
}

/** Where a visitor's contact details came from — all first-party, self-supplied. */
export type VisitorIdentitySource = 'lead' | 'account' | 'alert' | 'form'

export type VisitorRecord = {
  vid: string
  firstSeen: string
  lastSeen: string
  pageviews: number
  ip: string | null
  geo: VisitorGeo
  pages: VisitorPageHit[]
  email?: string | null
  zip?: string | null
  name?: string | null
  phone?: string | null
  audienceType?: string | null
  leadId?: string | null
  identitySources?: VisitorIdentitySource[]
  lastLoginAt?: string | null
  /** True when a hit arrived with the site-password cookie (`tmre_site_pass`). */
  isAdmin?: boolean
}

export function visitorIdentitySourceLabel(source: VisitorIdentitySource): string {
  if (source === 'lead') return 'Brief signup'
  if (source === 'account') return 'Signed in'
  if (source === 'alert') return 'Search alert'
  return 'Site form'
}

export function visitorIsIdentified(visitor: VisitorRecord): boolean {
  return Boolean(visitor.email || visitor.phone)
}

export function visitorIsAdmin(visitor: VisitorRecord): boolean {
  return visitor.isAdmin === true
}

export function emptyVisitorGeo(): VisitorGeo {
  return { city: null, region: null, postal: null, country: null, org: null }
}

/** 5-digit ZIP from a beacon / header override / stored column. */
export function normalizeVisitorZip(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return normalizeZip(String(Math.trunc(raw)).padStart(5, '0'))
  }
  if (typeof raw !== 'string') return null
  return normalizeZip(raw)
}

/** Header ZIP if stored, otherwise IP postal from geo. */
export function visitorZip(visitor: VisitorRecord): string | null {
  return normalizeVisitorZip(visitor.zip) ?? normalizeVisitorZip(visitor.geo.postal)
}

export function formatVisitorLocation(visitor: VisitorRecord): string {
  const zip = visitorZip(visitor)
  const town = townForZip(zip)
  if (town && zip) {
    const nick = zipAreaNickname(zip)
    return nick ? `${town}, CT ${zip} · ${nick}` : `${town}, CT ${zip}`
  }
  const { geo } = visitor
  const parts = [geo.city, geo.region, zip].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (geo.country) return geo.country
  return 'Unknown location'
}

export function formatVisitorIdentity(visitor: VisitorRecord): string {
  if (visitor.name && visitor.email) return `${visitor.name} · ${visitor.email}`
  if (visitor.email) return visitor.email
  if (visitor.name) return visitor.name
  if (visitor.phone) return visitor.phone
  return 'Anonymous'
}

export function visitorProviderLabel(visitor: VisitorRecord): string {
  const org = visitor.geo.org?.trim()
  return org || 'Unknown provider'
}

/** Newest lastSeen first; invalid timestamps sort last. */
function compareLastSeenDesc(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return tb - ta
}

export type VisitorLocationGroup = {
  location: string
  visitors: VisitorRecord[]
  visitorCount: number
  pageviews: number
  lastSeen: string
}

export type VisitorProviderGroup = {
  provider: string
  locations: VisitorLocationGroup[]
  visitorCount: number
  pageviews: number
  lastSeen: string
}

/**
 * Group visitors by ISP/org provider, then by location.
 * Providers and locations are sorted descending by pageviews (then count, then lastSeen).
 * Leaf visitors stay lastSeen descending.
 */
export function groupVisitorsByProviderThenLocation(
  visitors: readonly VisitorRecord[],
): VisitorProviderGroup[] {
  const byProvider = new Map<string, Map<string, VisitorRecord[]>>()

  for (const visitor of visitors) {
    const provider = visitorProviderLabel(visitor)
    const location = formatVisitorLocation(visitor)
    let locMap = byProvider.get(provider)
    if (!locMap) {
      locMap = new Map()
      byProvider.set(provider, locMap)
    }
    const bucket = locMap.get(location) ?? []
    bucket.push(visitor)
    locMap.set(location, bucket)
  }

  const groups: VisitorProviderGroup[] = []
  for (const [provider, locMap] of byProvider) {
    const locations: VisitorLocationGroup[] = []
    for (const [location, rows] of locMap) {
      const visitorsSorted = [...rows].sort((a, b) =>
        compareLastSeenDesc(a.lastSeen, b.lastSeen),
      )
      locations.push({
        location,
        visitors: visitorsSorted,
        visitorCount: visitorsSorted.length,
        pageviews: visitorsSorted.reduce((sum, v) => sum + (v.pageviews || 0), 0),
        lastSeen: visitorsSorted[0]?.lastSeen ?? '',
      })
    }
    locations.sort((a, b) => {
      if (b.pageviews !== a.pageviews) return b.pageviews - a.pageviews
      if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
      return compareLastSeenDesc(a.lastSeen, b.lastSeen)
    })
    groups.push({
      provider,
      locations,
      visitorCount: locations.reduce((sum, l) => sum + l.visitorCount, 0),
      pageviews: locations.reduce((sum, l) => sum + l.pageviews, 0),
      lastSeen: locations[0]?.lastSeen ?? '',
    })
  }

  groups.sort((a, b) => {
    if (b.pageviews !== a.pageviews) return b.pageviews - a.pageviews
    if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
    return compareLastSeenDesc(a.lastSeen, b.lastSeen)
  })
  return groups
}

export const UNKNOWN_VISITOR_ZIP = 'Unknown ZIP'

export type VisitorZipGroup = {
  zip: string
  location: string
  visitors: VisitorRecord[]
  visitorCount: number
  pageviews: number
  lastSeen: string
}

/** Group visitors by ZIP (header override or IP postal). Unknown last. */
export function groupVisitorsByZip(
  visitors: readonly VisitorRecord[],
): VisitorZipGroup[] {
  const byZip = new Map<string, VisitorRecord[]>()
  for (const visitor of visitors) {
    const zip = visitorZip(visitor) ?? UNKNOWN_VISITOR_ZIP
    const bucket = byZip.get(zip) ?? []
    bucket.push(visitor)
    byZip.set(zip, bucket)
  }

  const groups: VisitorZipGroup[] = []
  for (const [zip, rows] of byZip) {
    const visitorsSorted = [...rows].sort((a, b) =>
      compareLastSeenDesc(a.lastSeen, b.lastSeen),
    )
    groups.push({
      zip,
      location: formatVisitorLocation(visitorsSorted[0]!),
      visitors: visitorsSorted,
      visitorCount: visitorsSorted.length,
      pageviews: visitorsSorted.reduce((sum, v) => sum + (v.pageviews || 0), 0),
      lastSeen: visitorsSorted[0]?.lastSeen ?? '',
    })
  }

  groups.sort((a, b) => {
    if (a.zip === UNKNOWN_VISITOR_ZIP && b.zip !== UNKNOWN_VISITOR_ZIP) return 1
    if (b.zip === UNKNOWN_VISITOR_ZIP && a.zip !== UNKNOWN_VISITOR_ZIP) return -1
    if (b.pageviews !== a.pageviews) return b.pageviews - a.pageviews
    if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
    return compareLastSeenDesc(a.lastSeen, b.lastSeen)
  })
  return groups
}

