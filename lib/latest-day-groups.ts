import { latestRowActivityIso } from '@/lib/latest-activity'
import type { LatestListingRow } from '@/lib/latest-listings'
import { mlsTimestampMs } from '@/lib/mls-time'

const LOCAL_DATE_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: 'numeric',
})

const LOCAL_DATE_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

export function localDateKey(iso: string | null | undefined): string {
  const t = mlsTimestampMs(iso)
  if (Number.isNaN(t)) return 'unknown'
  return LOCAL_DATE_KEY_FMT.format(new Date(t))
}

export function localDateLabel(iso: string | null | undefined): string {
  const t = mlsTimestampMs(iso)
  if (Number.isNaN(t)) return 'Undated'
  const fullDate = LOCAL_DATE_LABEL_FMT.format(new Date(t))
  const todayKey = LOCAL_DATE_KEY_FMT.format(new Date())
  const key = localDateKey(iso)
  if (key === todayKey) return 'Today'
  const yesterday = new Date(Date.now() - 86_400_000)
  if (key === LOCAL_DATE_KEY_FMT.format(yesterday)) {
    return `Yesterday, ${fullDate}`
  }
  return fullDate
}

export type FeedDayGroup = {
  /** Local calendar day, e.g. `2026-08-28`. */
  dayKey: string
  /** Key for the collapsed-group set, namespaced away from town labels. */
  collapseKey: string
  /** Today / Yesterday, August 27, 2026 / August 26, 2026. */
  label: string
  rows: LatestListingRow[]
}

/**
 * /latest and /closed keep one collapsed-group set for both grouping modes, so
 * a day bucket has to be unmistakable from a town called "Today".
 */
export function dayCollapseKey(dayKey: string): string {
  return `day::${dayKey}`
}

/**
 * Contiguous day buckets in feed order. Both feeds arrive newest-first and are
 * meant to stay that way, so this walks the rows rather than sorting them —
 * the same rule the inline "has the day changed since the previous row?"
 * separator followed before these buckets became collapsible.
 */
export function groupRowsByDay(rows: LatestListingRow[]): FeedDayGroup[] {
  const groups: FeedDayGroup[] = []
  for (const row of rows) {
    const iso = latestRowActivityIso(row)
    const dayKey = localDateKey(iso)
    const open = groups[groups.length - 1]
    if (open && open.dayKey === dayKey) {
      open.rows.push(row)
      continue
    }
    groups.push({
      dayKey,
      collapseKey: dayCollapseKey(dayKey),
      label: localDateLabel(iso),
      rows: [row],
    })
  }
  return groups
}
