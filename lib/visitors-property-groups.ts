/**
 * Group visitor page hits by property, then by calendar day (America/New_York).
 * Built from the same `visitors.pages` the log shows — so it correlates with
 * the provider view. Distinct from `content_views` running totals (Most viewed).
 */

import { resolveViewedContent } from '@/lib/content-views'
import type { VisitorRecord } from '@/lib/visitors-types'

const ET = 'America/New_York'

function dayKeyEt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dayLabelEt(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  // Noon UTC keeps the civil date stable when formatting in ET.
  const date = new Date(Date.UTC(y, m - 1, d, 16, 0, 0))
  return new Intl.DateTimeFormat(undefined, {
    timeZone: ET,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export type VisitorPropertyDayVisitor = {
  visitor: VisitorRecord
  /** Hits on this property that calendar day (from retained pages). */
  hits: number
  lastAt: string
}

export type VisitorPropertyDayGroup = {
  dayKey: string
  dayLabel: string
  hits: number
  visitorCount: number
  visitors: VisitorPropertyDayVisitor[]
}

export type VisitorPropertyGroup = {
  mlsId: string
  label: string
  hits: number
  visitorCount: number
  lastAt: string
  days: VisitorPropertyDayGroup[]
}

type DayBucket = Map<
  string,
  { visitor: VisitorRecord; hits: number; lastAt: string }
>

/**
 * Property → date → visitors, sorted by hit count (properties) then newest day.
 * Only listing/spotlight paths that resolve to an MLS id are included.
 */
export function groupVisitorsByPropertyThenDate(
  visitors: readonly VisitorRecord[],
  propertyLabels: Record<string, string> = {},
): VisitorPropertyGroup[] {
  const byMls = new Map<string, Map<string, DayBucket>>()

  for (const visitor of visitors) {
    for (const page of visitor.pages) {
      const content = resolveViewedContent(page.path)
      if (content.kind !== 'listing' || !content.mlsId) continue
      const day = dayKeyEt(page.at)
      if (!day) continue

      let dayMap = byMls.get(content.mlsId)
      if (!dayMap) {
        dayMap = new Map()
        byMls.set(content.mlsId, dayMap)
      }
      let bucket = dayMap.get(day)
      if (!bucket) {
        bucket = new Map()
        dayMap.set(day, bucket)
      }
      const existing = bucket.get(visitor.vid)
      if (existing) {
        existing.hits += 1
        if (Date.parse(page.at) > Date.parse(existing.lastAt)) {
          existing.lastAt = page.at
        }
      } else {
        bucket.set(visitor.vid, {
          visitor,
          hits: 1,
          lastAt: page.at,
        })
      }
    }
  }

  const groups: VisitorPropertyGroup[] = []
  for (const [mlsId, dayMap] of byMls) {
    const days: VisitorPropertyDayGroup[] = []
    let hits = 0
    const vids = new Set<string>()
    let lastAt = ''

    for (const [dayKey, bucket] of dayMap) {
      const dayVisitors = [...bucket.values()].sort(
        (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt),
      )
      const dayHits = dayVisitors.reduce((sum, row) => sum + row.hits, 0)
      hits += dayHits
      for (const row of dayVisitors) vids.add(row.visitor.vid)
      const newest = dayVisitors[0]?.lastAt ?? ''
      if (!lastAt || Date.parse(newest) > Date.parse(lastAt)) lastAt = newest
      days.push({
        dayKey,
        dayLabel: dayLabelEt(dayKey),
        hits: dayHits,
        visitorCount: dayVisitors.length,
        visitors: dayVisitors,
      })
    }

    days.sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    groups.push({
      mlsId,
      label: propertyLabels[mlsId] ?? `MLS ${mlsId}`,
      hits,
      visitorCount: vids.size,
      lastAt,
      days,
    })
  }

  groups.sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits
    if (b.visitorCount !== a.visitorCount) return b.visitorCount - a.visitorCount
    return Date.parse(b.lastAt) - Date.parse(a.lastAt)
  })
  return groups
}
