import 'server-only'

import { readVisitorGeoByIp } from '@/lib/db/visitors-repo'
import {
  emptyIpapiLookup,
  isPrivateOrLocalIp,
  lookupIpapi,
  peekIpapiLookup,
  rememberIpapiLookup,
  type IpapiLookup,
} from '@/lib/ipapi-geo'
import type { VisitorGeo } from '@/lib/visitors-types'

function geoToLookup(geo: VisitorGeo): IpapiLookup {
  return {
    city: geo.city,
    region: geo.region,
    postal: geo.postal,
    country: geo.country,
    org: geo.org,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
  }
}

export function ipapiLookupToVisitorGeo(lookup: IpapiLookup): VisitorGeo {
  return {
    city: lookup.city,
    region: lookup.region,
    postal: lookup.postal,
    country: lookup.country,
    org: lookup.org,
    latitude: lookup.latitude,
    longitude: lookup.longitude,
  }
}

/**
 * Free ipapi.co, cached: memory (same isolate) then visitors.geo for that IP,
 * then one network call. Header ZIP and the visitor log share this path so a
 * first visit does not spend two of the ~1000/day credits.
 */
export async function resolveVisitorIpGeo(
  ip: string | null,
): Promise<IpapiLookup> {
  if (!ip || isPrivateOrLocalIp(ip)) return emptyIpapiLookup()
  const mem = peekIpapiLookup(ip)
  if (mem) return mem
  try {
    const stored = await readVisitorGeoByIp(ip)
    if (stored && (stored.postal || stored.city)) {
      const lookup = geoToLookup(stored)
      rememberIpapiLookup(ip, lookup)
      return lookup
    }
  } catch (err) {
    console.warn('[ipapi] visitors.geo reuse failed', err)
  }
  return lookupIpapi(ip)
}
