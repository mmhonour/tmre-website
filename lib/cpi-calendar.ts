/**
 * Hand-maintained BLS CPI release calendar for /fed-analysis.
 * Dates from bls.gov/schedule/news_release/cpi.htm; prints filled after release.
 * Update after each 8:30 a.m. ET print (usually second week of the month).
 */

import { formatFomcDayWithWeekday, parseFomcYmd } from '@/lib/fed-fomc-calendar'

export type CpiRelease = {
  id: string
  /** Reference / survey month (YYYY-MM). */
  referenceMonth: string
  /** BLS release day (YYYY-MM-DD, America/New_York). */
  releaseDate: string
  releaseTimeEt: string
  /** Seasonally adjusted monthly % change (all items). */
  momPct: number | null
  /** 12-month % change, not seasonally adjusted (all items). */
  yoyPct: number | null
  /** SA monthly % change, all items less food and energy. */
  coreMomPct: number | null
  /** 12-month % change, all items less food and energy. */
  coreYoyPct: number | null
  releaseUrl: string | null
  note?: string
}

export const CPI_SCHEDULE_URL =
  'https://www.bls.gov/schedule/news_release/cpi.htm'

export const CPI_RELEASES: readonly CpiRelease[] = [
  // —— 2025 ——
  {
    id: '2025-01',
    referenceMonth: '2025-01',
    releaseDate: '2025-02-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-02',
    referenceMonth: '2025-02',
    releaseDate: '2025-03-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-03',
    referenceMonth: '2025-03',
    releaseDate: '2025-04-10',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-04',
    referenceMonth: '2025-04',
    releaseDate: '2025-05-13',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-05',
    referenceMonth: '2025-05',
    releaseDate: '2025-06-11',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-06',
    referenceMonth: '2025-06',
    releaseDate: '2025-07-15',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-07',
    referenceMonth: '2025-07',
    releaseDate: '2025-08-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-08',
    referenceMonth: '2025-08',
    releaseDate: '2025-09-11',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2025-09',
    referenceMonth: '2025-09',
    releaseDate: '2025-10-24',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
    note: 'Delayed from the usual mid-month slot.',
  },
  {
    id: '2025-11',
    referenceMonth: '2025-11',
    releaseDate: '2025-12-18',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  // —— 2026 ——
  {
    id: '2025-12',
    referenceMonth: '2025-12',
    releaseDate: '2026-01-13',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-01',
    referenceMonth: '2026-01',
    releaseDate: '2026-02-13',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-02',
    referenceMonth: '2026-02',
    releaseDate: '2026-03-11',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-03',
    referenceMonth: '2026-03',
    releaseDate: '2026-04-10',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-04',
    referenceMonth: '2026-04',
    releaseDate: '2026-05-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-05',
    referenceMonth: '2026-05',
    releaseDate: '2026-06-10',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: 0.5,
    yoyPct: 4.2,
    coreMomPct: null,
    coreYoyPct: 2.9,
    releaseUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
    note: 'Energy drove most of the monthly rise.',
  },
  {
    id: '2026-06',
    referenceMonth: '2026-06',
    releaseDate: '2026-07-14',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: -0.4,
    yoyPct: 3.5,
    coreMomPct: 0,
    coreYoyPct: 2.6,
    releaseUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
    note: 'Gasoline led the monthly decline; core flat on the month.',
  },
  {
    id: '2026-07',
    referenceMonth: '2026-07',
    releaseDate: '2026-08-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-08',
    referenceMonth: '2026-08',
    releaseDate: '2026-09-11',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-09',
    referenceMonth: '2026-09',
    releaseDate: '2026-10-14',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-10',
    referenceMonth: '2026-10',
    releaseDate: '2026-11-10',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-11',
    referenceMonth: '2026-11',
    releaseDate: '2026-12-10',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
]

export function formatCpiReferenceMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1))
}

export function formatCpiPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

export function cpiHasPrint(r: CpiRelease): boolean {
  return r.yoyPct != null || r.momPct != null
}

export type PrevailingCpi = {
  release: CpiRelease
  releasedOnLabel: string
  referenceLabel: string
  headline: string
}

export function getPrevailingCpi(
  now = new Date(),
  releases: readonly CpiRelease[] = CPI_RELEASES,
): PrevailingCpi | null {
  const printed = releases
    .filter((r) => cpiHasPrint(r))
    .filter((r) => parseFomcYmd(r.releaseDate).getTime() <= now.getTime())
    .sort(
      (a, b) =>
        parseFomcYmd(b.releaseDate).getTime() -
        parseFomcYmd(a.releaseDate).getTime(),
    )
  const release = printed[0]
  if (!release) return null
  const parts = [
    release.yoyPct != null ? `${formatCpiPct(release.yoyPct)} YoY` : null,
    release.momPct != null ? `${formatCpiPct(release.momPct)} MoM` : null,
  ].filter(Boolean)
  return {
    release,
    releasedOnLabel: formatFomcDayWithWeekday(release.releaseDate, {
      month: 'long',
    }),
    referenceLabel: formatCpiReferenceMonth(release.referenceMonth),
    headline: parts.join(' · ') || 'Print recorded',
  }
}

export function getNextCpiRelease(
  now = new Date(),
  releases: readonly CpiRelease[] = CPI_RELEASES,
): CpiRelease | null {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const upcoming = releases
    .filter((r) => parseFomcYmd(r.releaseDate).getTime() >= start.getTime())
    .sort(
      (a, b) =>
        parseFomcYmd(a.releaseDate).getTime() -
        parseFomcYmd(b.releaseDate).getTime(),
    )
  return upcoming[0] ?? null
}

export function cpiReleasesOnDay(
  year: number,
  monthIndex: number,
  day: number,
  releases: readonly CpiRelease[] = CPI_RELEASES,
): CpiRelease[] {
  return releases.filter((r) => {
    const d = parseFomcYmd(r.releaseDate)
    return (
      d.getFullYear() === year &&
      d.getMonth() === monthIndex &&
      d.getDate() === day
    )
  })
}
