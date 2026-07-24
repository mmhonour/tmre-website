import { statsMonthChartYears } from '@/lib/stats-month-years'
import type { ListingKind } from '@/lib/listing-kind'

export type MonthlyCount = { year: number; month: number; count: number }

export type MonthsSupplyByMonthPayload = {
  city: string
  kind: ListingKind
  /** Months supply per calendar month (`count` is the ratio, 1 decimal). */
  data: MonthlyCount[]
}

function monthsSupplyRatio(
  activeCount: number,
  avgMonthlyClosings: number | null | undefined,
): number | null {
  if (!avgMonthlyClosings || avgMonthlyClosings <= 0) return null
  if (!Number.isFinite(activeCount) || activeCount < 0) return null
  return activeCount / avgMonthlyClosings
}

function countAt(
  rows: readonly MonthlyCount[],
  year: number,
  month: number,
): number {
  return rows.find((r) => r.year === year && r.month === month)?.count ?? 0
}

/** Walk back `offset` calendar months from year/month (offset 0 = that month). */
function shiftMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 - offset, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/**
 * Trailing 3-month average closings ending at (and including) the given month.
 * Matches the site months-supply rate window, applied historically per month-end.
 */
export function trailingAvgClosingsAtMonth(
  salesByMonth: readonly MonthlyCount[],
  year: number,
  month: number,
): number | null {
  const recent: number[] = []
  for (let offset = 0; offset < 3; offset++) {
    const ym = shiftMonth(year, month, offset)
    recent.push(countAt(salesByMonth, ym.year, ym.month))
  }
  if (!recent.some((n) => n > 0)) return null
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

/**
 * End-of-month months supply = reconstructed active inventory ÷ trailing
 * 3-month avg closings (ending that month). `count` is rounded to 1 decimal.
 */
export function computeMonthsSupplyByMonth(
  activeByMonth: readonly MonthlyCount[],
  salesByMonth: readonly MonthlyCount[],
  city: string,
  kind: ListingKind,
  now: Date = new Date(),
): MonthsSupplyByMonthPayload {
  const years = statsMonthChartYears()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const data: MonthlyCount[] = []

  for (const year of years) {
    const maxMonth = year < currentYear ? 12 : currentMonth
    for (let month = 1; month <= 12; month++) {
      if (month > maxMonth) {
        data.push({ year, month, count: 0 })
        continue
      }
      const active = countAt(activeByMonth, year, month)
      const avg = trailingAvgClosingsAtMonth(salesByMonth, year, month)
      const ratio = monthsSupplyRatio(active, avg)
      data.push({
        year,
        month,
        count: ratio == null ? 0 : Math.round(ratio * 10) / 10,
      })
    }
  }

  return { city, kind, data }
}
