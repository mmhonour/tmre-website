/**
 * Who viewed a content_views property — grouped provider → location (desc by
 * views on that property). Client-safe; no DB imports.
 */

import type { ContentViewSummary } from '@/lib/content-views'
import {
  emptyVisitorGeo,
  formatVisitorLocation,
  visitorProviderLabel,
  type VisitorRecord,
} from '@/lib/visitors-types'

export type ContentViewAudienceHit = {
  visitor: VisitorRecord
  /** Views of this property by this visitor (content_views.views). */
  views: number
  lastViewedAt: string
}

export type ContentViewAudienceLocationGroup = {
  location: string
  visitors: ContentViewAudienceHit[]
  visitorCount: number
  views: number
  lastSeen: string
}

export type ContentViewAudienceProviderGroup = {
  provider: string
  locations: ContentViewAudienceLocationGroup[]
  visitorCount: number
  views: number
  lastSeen: string
}

export type ContentViewSummaryWithAudience = ContentViewSummary & {
  audience: ContentViewAudienceProviderGroup[]
}

function compareLastSeenDesc(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return tb - ta
}

/** Stub when content_views has a vid that is no longer in visitors. */
export function stubVisitorRecord(vid: string): VisitorRecord {
  return {
    vid,
    firstSeen: '',
    lastSeen: '',
    pageviews: 0,
    ip: null,
    geo: emptyVisitorGeo(),
    pages: [],
  }
}

/**
 * Group property viewers by ISP/org provider, then by location.
 * Providers, locations, and leaf visitors sorted descending by views on this
 * property (then visitor count / last seen).
 */
export function groupContentViewAudienceByProviderLocation(
  hits: readonly ContentViewAudienceHit[],
): ContentViewAudienceProviderGroup[] {
  const byProvider = new Map<string, Map<string, ContentViewAudienceHit[]>>()

  for (const hit of hits) {
    const provider = visitorProviderLabel(hit.visitor)
    const location = formatVisitorLocation(hit.visitor)
    let locMap = byProvider.get(provider)
    if (!locMap) {
      locMap = new Map()
      byProvider.set(provider, locMap)
    }
    const bucket = locMap.get(location) ?? []
    bucket.push(hit)
    locMap.set(location, bucket)
  }

  const groups: ContentViewAudienceProviderGroup[] = []
  for (const [provider, locMap] of byProvider) {
    const locations: ContentViewAudienceLocationGroup[] = []
    for (const [location, rows] of locMap) {
      const visitorsSorted = [...rows].sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views
        return compareLastSeenDesc(a.lastViewedAt, b.lastViewedAt)
      })
      locations.push({
        location,
        visitors: visitorsSorted,
        visitorCount: visitorsSorted.length,
        views: visitorsSorted.reduce((sum, h) => sum + h.views, 0),
        lastSeen: visitorsSorted[0]?.lastViewedAt ?? '',
      })
    }
    locations.sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views
      if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
      return compareLastSeenDesc(a.lastSeen, b.lastSeen)
    })
    groups.push({
      provider,
      locations,
      visitorCount: locations.reduce((sum, l) => sum + l.visitorCount, 0),
      views: locations.reduce((sum, l) => sum + l.views, 0),
      lastSeen: locations[0]?.lastSeen ?? '',
    })
  }

  groups.sort((a, b) => {
    if (b.views !== a.views) return b.views - a.views
    if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
    return compareLastSeenDesc(a.lastSeen, b.lastSeen)
  })
  return groups
}

export function attachAudienceToContentViews(
  summaries: readonly ContentViewSummary[],
  hitsByKey: Map<string, ContentViewAudienceHit[]>,
): ContentViewSummaryWithAudience[] {
  return summaries.map((row) => ({
    ...row,
    audience: groupContentViewAudienceByProviderLocation(
      hitsByKey.get(row.contentKey) ?? [],
    ),
  }))
}
