/** Shared visitor log types (safe for client imports). */

export type VisitorGeo = {
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  org: string | null
}

export type VisitorPageHit = {
  path: string
  at: string
}

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
  audienceType?: string | null
  leadId?: string | null
}

export function emptyVisitorGeo(): VisitorGeo {
  return { city: null, region: null, postal: null, country: null, org: null }
}
