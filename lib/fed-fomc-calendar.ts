/**
 * Hand-maintained FOMC calendar + rate decisions for /fed-analysis.
 * Dates from federalreserve.gov calendars; outcomes from published statements.
 * Update after each decision day (usually 2:00 p.m. ET on the second day).
 * History (2020–2024) lives in fed-fomc-history.ts and is prepended below.
 */

import { FOMC_HISTORY } from '@/lib/fed-fomc-history'

export type FomcDecision = 'cut' | 'hold' | 'hike'

export type FomcMeeting = {
  id: string
  /** First calendar day of the meeting (YYYY-MM-DD, America/New_York). */
  startDate: string
  /** Decision / statement day (usually day 2). */
  endDate: string
  /** Summary of Economic Projections meeting. */
  hasSep: boolean
  decision: FomcDecision | null
  /** Signed basis-point change; 0 for hold; null if not yet decided. */
  basisPoints: number | null
  targetRangeLow: number | null
  targetRangeHigh: number | null
  statementUrl: string | null
  note?: string
  /**
   * Short text grepped from the official FOMC statement (Fed sync → Postgres).
   * Not AI-generated.
   */
  summary?: string | null
  /** Lead paragraph from the official statement. */
  excerpt?: string | null
  /** Voting for / against lines when parsed. */
  voteNote?: string | null
  /** ISO timestamp of last successful Fed sync for this meeting. */
  syncedAt?: string | null
}

/** Forward calendar (2025+) — concatenated with {@link FOMC_HISTORY}. */
const FOMC_FORWARD: readonly FomcMeeting[] = [
  // —— 2025 ——
  {
    id: '2025-01',
    startDate: '2025-01-28',
    endDate: '2025-01-29',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 4.25,
    targetRangeHigh: 4.5,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250129a.htm',
  },
  {
    id: '2025-03',
    startDate: '2025-03-18',
    endDate: '2025-03-19',
    hasSep: true,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 4.25,
    targetRangeHigh: 4.5,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250319a.htm',
  },
  {
    id: '2025-05',
    startDate: '2025-05-06',
    endDate: '2025-05-07',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 4.25,
    targetRangeHigh: 4.5,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250507a.htm',
  },
  {
    id: '2025-06',
    startDate: '2025-06-17',
    endDate: '2025-06-18',
    hasSep: true,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 4.25,
    targetRangeHigh: 4.5,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250618a.htm',
  },
  {
    id: '2025-07',
    startDate: '2025-07-29',
    endDate: '2025-07-30',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 4.25,
    targetRangeHigh: 4.5,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250730a.htm',
  },
  {
    id: '2025-09',
    startDate: '2025-09-16',
    endDate: '2025-09-17',
    hasSep: true,
    decision: 'cut',
    basisPoints: -25,
    targetRangeLow: 4.0,
    targetRangeHigh: 4.25,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250917a.htm',
  },
  {
    id: '2025-10',
    startDate: '2025-10-28',
    endDate: '2025-10-29',
    hasSep: false,
    decision: 'cut',
    basisPoints: -25,
    targetRangeLow: 3.75,
    targetRangeHigh: 4.0,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20251029a.htm',
  },
  {
    id: '2025-12',
    startDate: '2025-12-09',
    endDate: '2025-12-10',
    hasSep: true,
    decision: 'cut',
    basisPoints: -25,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20251210a.htm',
  },
  // —— 2026 ——
  {
    id: '2026-01',
    startDate: '2026-01-27',
    endDate: '2026-01-28',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260128a.htm',
  },
  {
    id: '2026-03',
    startDate: '2026-03-17',
    endDate: '2026-03-18',
    hasSep: true,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a.htm',
  },
  {
    id: '2026-04',
    startDate: '2026-04-28',
    endDate: '2026-04-29',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260429a.htm',
  },
  {
    id: '2026-06',
    startDate: '2026-06-16',
    endDate: '2026-06-17',
    hasSep: true,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/monetarypolicy/files/monetary20260617a1.pdf',
    note: 'Unanimous hold; SEP median implied next move could be a hike.',
  },
  {
    id: '2026-07',
    startDate: '2026-07-28',
    endDate: '2026-07-29',
    hasSep: false,
    decision: 'hold',
    basisPoints: 0,
    targetRangeLow: 3.5,
    targetRangeHigh: 3.75,
    statementUrl:
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm',
    note: '9–3 vote; three members preferred a 25bp hike.',
    excerpt:
      'The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent, in support of the Federal Reserve\'s dual mandate. The Committee is continuing its policy of maintaining ample reserves in the banking system.',
    summary:
      'The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent, in support of the Federal Reserve\'s dual mandate. The Committee is continuing its policy of maintaining ample reserves in the banking system.\n\nEconomic activity is expanding at a solid pace despite elevated uncertainty that owes, in part, to the conflict in the Middle East. Productivity growth and capital investment are strong. Job gains have kept pace with the workforce, and the unemployment rate has changed little.\n\nInflation remains elevated relative to the Committee\'s 2 percent goal, in part reflecting supply shocks that have driven price increases in certain sectors, including energy. The Committee will deliver price stability.',
    voteNote:
      'Voting against the monetary policy action were Beth M. Hammack, Neel Kashkari, and Lorie K. Logan, who preferred to raise the target range for the federal funds rate by 1/4 percentage point at this meeting.',
  },
  {
    id: '2026-09',
    startDate: '2026-09-15',
    endDate: '2026-09-16',
    hasSep: true,
    decision: null,
    basisPoints: null,
    targetRangeLow: null,
    targetRangeHigh: null,
    statementUrl: null,
  },
  {
    id: '2026-10',
    startDate: '2026-10-27',
    endDate: '2026-10-28',
    hasSep: false,
    decision: null,
    basisPoints: null,
    targetRangeLow: null,
    targetRangeHigh: null,
    statementUrl: null,
  },
  {
    id: '2026-12',
    startDate: '2026-12-08',
    endDate: '2026-12-09',
    hasSep: true,
    decision: null,
    basisPoints: null,
    targetRangeLow: null,
    targetRangeHigh: null,
    statementUrl: null,
  },
]

/** Full seed calendar: history through the current / next-year schedule. */
export const FOMC_MEETINGS: readonly FomcMeeting[] = [
  ...FOMC_HISTORY,
  ...FOMC_FORWARD,
]

export type PrevailingFedPolicy = {
  meeting: FomcMeeting
  targetLabel: string
  decisionLabel: string
  decidedOnLabel: string
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12, 0, 0)
}

export function formatFedFundsRange(
  low: number | null,
  high: number | null,
): string {
  if (low == null || high == null) return '—'
  const fmt = (n: number) =>
    n % 1 === 0 ? `${n.toFixed(0)}%` : `${n.toFixed(2).replace(/0$/, '')}%`
  return `${fmt(low)} – ${fmt(high)}`
}

export function decisionLabel(
  decision: FomcDecision | null,
  basisPoints: number | null,
): string {
  if (decision == null) return 'Pending'
  if (decision === 'hold') return 'Hold'
  if (decision === 'cut') {
    return basisPoints != null ? `Cut ${Math.abs(basisPoints)} bps` : 'Cut'
  }
  return basisPoints != null ? `Hike ${Math.abs(basisPoints)} bps` : 'Hike'
}

/** Single calendar day with weekday — e.g. "Wed, Jul 29, 2026". */
export function formatFomcDayWithWeekday(
  ymd: string,
  opts?: { month?: 'short' | 'long'; year?: boolean },
): string {
  const date = parseYmd(ymd)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: opts?.month ?? 'short',
    day: 'numeric',
    ...(opts?.year === false ? {} : { year: 'numeric' }),
  }).format(date)
}

/** Meeting span with weekdays on both ends — e.g. "Tue, Jul 28 – Wed, Jul 29, 2026". */
export function formatFomcMeetingSpan(startDate: string, endDate: string): string {
  const start = parseYmd(startDate)
  const end = parseYmd(endDate)
  const sameMonth = start.getMonth() === end.getMonth()
  const a = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start)
  const b = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end)
  return `${a} – ${b}`
}

/** Most recent meeting with a recorded decision (prevailing policy). */
export function getPrevailingFedPolicy(
  now = new Date(),
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
): PrevailingFedPolicy | null {
  const decided = meetings
    .filter((m) => m.decision != null && m.targetRangeLow != null)
    .filter((m) => parseYmd(m.endDate).getTime() <= now.getTime())
    .sort(
      (a, b) => parseYmd(b.endDate).getTime() - parseYmd(a.endDate).getTime(),
    )
  const meeting = decided[0]
  if (!meeting || meeting.decision == null) return null
  const decidedOnLabel = formatFomcDayWithWeekday(meeting.endDate, {
    month: 'long',
  })
  return {
    meeting,
    targetLabel: formatFedFundsRange(
      meeting.targetRangeLow,
      meeting.targetRangeHigh,
    ),
    decisionLabel: decisionLabel(meeting.decision, meeting.basisPoints),
    decidedOnLabel,
  }
}

export function getNextFomcMeeting(
  now = new Date(),
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
): FomcMeeting | null {
  const upcoming = meetings
    .filter((m) => parseYmd(m.endDate).getTime() >= startOfLocalDay(now).getTime())
    .sort(
      (a, b) => parseYmd(a.endDate).getTime() - parseYmd(b.endDate).getTime(),
    )
  return upcoming[0] ?? null
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

export function meetingsInMonth(
  year: number,
  monthIndex: number,
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
): FomcMeeting[] {
  return meetings.filter((m) => {
    const end = parseYmd(m.endDate)
    return end.getFullYear() === year && end.getMonth() === monthIndex
  })
}

export function meetingOnDay(
  year: number,
  monthIndex: number,
  day: number,
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
): FomcMeeting | null {
  return (
    meetings.find((m) => {
      const start = parseYmd(m.startDate)
      const end = parseYmd(m.endDate)
      const cell = new Date(year, monthIndex, day, 12, 0, 0)
      return cell.getTime() >= startOfLocalDay(start).getTime() &&
        cell.getTime() <= startOfLocalDay(end).getTime()
    }) ?? null
  )
}

export { parseYmd as parseFomcYmd }
