/**
 * Upcoming FOMC + CPI dates for /fed-analysis (next N months from live calendars).
 */

import {
  formatCpiPct,
  formatCpiReferenceMonth,
  type CpiRelease,
} from '@/lib/cpi-calendar'
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcDayWithWeekday,
  formatFomcMeetingSpan,
  parseFomcYmd,
  type FomcMeeting,
} from '@/lib/fed-fomc-calendar'

export type FedMarketUpcomingEvent = {
  key: string
  kind: 'fomc' | 'cpi'
  /** Sort / filter day (YYYY-MM-DD). */
  date: string
  headline: string
  detail: string
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfHorizon(now: Date, months: number): Date {
  const d = startOfLocalDay(now)
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate(), 23, 59, 59, 999)
}

/**
 * FOMC decision days + CPI release days from `now` through the next `months`
 * (default 3). Uses the live meeting/release arrays (Postgres overlay after sync).
 */
export function listUpcomingFedMarketEvents(
  now: Date,
  meetings: readonly FomcMeeting[],
  releases: readonly CpiRelease[],
  months = 3,
): FedMarketUpcomingEvent[] {
  const from = startOfLocalDay(now).getTime()
  const to = endOfHorizon(now, months).getTime()
  const out: FedMarketUpcomingEvent[] = []

  for (const m of meetings) {
    const t = parseFomcYmd(m.endDate).getTime()
    if (t < from || t > to) continue
    out.push({
      key: `fomc-${m.id}`,
      kind: 'fomc',
      date: m.endDate,
      headline: formatFomcMeetingSpan(m.startDate, m.endDate),
      detail:
        m.decision != null
          ? `${decisionLabel(m.decision, m.basisPoints)} · ${formatFedFundsRange(m.targetRangeLow, m.targetRangeHigh)}`
          : m.hasSep
            ? 'Decision pending · includes SEP'
            : 'Decision pending',
    })
  }

  for (const r of releases) {
    const t = parseFomcYmd(r.releaseDate).getTime()
    if (t < from || t > to) continue
    const print =
      r.yoyPct != null || r.momPct != null
        ? [
            r.yoyPct != null ? `${formatCpiPct(r.yoyPct)} YoY` : null,
            r.momPct != null ? `${formatCpiPct(r.momPct)} MoM` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Awaiting print'
    out.push({
      key: `cpi-${r.id}`,
      kind: 'cpi',
      date: r.releaseDate,
      headline: formatFomcDayWithWeekday(r.releaseDate, { month: 'short' }),
      detail: `${formatCpiReferenceMonth(r.referenceMonth)} · ${print}`,
    })
  }

  return out.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.kind.localeCompare(b.kind)
  })
}
