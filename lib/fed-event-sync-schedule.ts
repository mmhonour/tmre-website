/**
 * Event-day schedules for FOMC / CPI Fed syncs.
 * FOMC: decision day (meeting endDate) at Configure start time (default 15:15 ET).
 * CPI: BLS release day at Configure start time (default 09:15 ET).
 */

import { CPI_RELEASES, type CpiRelease } from '@/lib/cpi-calendar'
import { FOMC_MEETINGS, type FomcMeeting } from '@/lib/fed-fomc-calendar'
import { parseStartTimeEt } from '@/lib/sync-schedule-config-shared'

const ET = 'America/New_York'

export const FOMC_SYNC_DEFAULT_START_ET = '15:15'
export const CPI_SYNC_DEFAULT_START_ET = '09:15'

export function etYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Absolute instant for YYYY-MM-DD HH:MM America/New_York. */
export function etWallClockToDate(
  ymd: string,
  hour: number,
  minute: number,
  from = new Date(),
): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  if (!y || !mo || !d) return from

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(from)

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const yN = get('year')
  const mN = get('month')
  const dN = get('day')
  const etHour = get('hour') === 24 ? 0 : get('hour')
  const etMinute = get('minute')
  const etSecond = get('second')

  const etAsUtc = Date.UTC(yN, mN - 1, dN, etHour, etMinute, etSecond)
  const targetAsUtc = Date.UTC(y, mo - 1, d, hour, minute, 0)
  return new Date(from.getTime() + (targetAsUtc - etAsUtc))
}

export type FedEventSyncTarget = {
  id: string
  at: Date
  label: string
}

function startParts(startTimeEt: string): { hour: number; minute: number } {
  return parseStartTimeEt(startTimeEt)
}

/** Next FOMC decision-day sync slot at or after `now`. */
export function nextFomcSyncTarget(
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
  now = new Date(),
  startTimeEt = FOMC_SYNC_DEFAULT_START_ET,
): FedEventSyncTarget | null {
  const { hour, minute } = startParts(startTimeEt)
  const sorted = [...meetings].sort((a, b) =>
    a.endDate.localeCompare(b.endDate),
  )
  for (const m of sorted) {
    const at = etWallClockToDate(m.endDate, hour, minute, now)
    if (at.getTime() >= now.getTime()) {
      return {
        id: m.id,
        at,
        label: `FOMC ${m.id} · ${m.endDate}`,
      }
    }
  }
  return null
}

/** Next CPI release-day sync slot at or after `now`. */
export function nextCpiSyncTarget(
  releases: readonly CpiRelease[] = CPI_RELEASES,
  now = new Date(),
  startTimeEt = CPI_SYNC_DEFAULT_START_ET,
): FedEventSyncTarget | null {
  const { hour, minute } = startParts(startTimeEt)
  const sorted = [...releases].sort((a, b) =>
    a.releaseDate.localeCompare(b.releaseDate),
  )
  for (const r of sorted) {
    const at = etWallClockToDate(r.releaseDate, hour, minute, now)
    if (at.getTime() >= now.getTime()) {
      return {
        id: r.id,
        at,
        label: `CPI ${r.id} · ${r.releaseDate}`,
      }
    }
  }
  return null
}

/**
 * Meeting to sync right now: today is decision day, past start time ET,
 * and we have not yet recorded a successful sync for this meeting id.
 */
export function fomcSyncDueMeeting(
  meetings: readonly FomcMeeting[] = FOMC_MEETINGS,
  now = new Date(),
  startTimeEt = FOMC_SYNC_DEFAULT_START_ET,
  lastSyncedEventId: string | null = null,
): FomcMeeting | null {
  const today = etYmd(now)
  const { hour, minute } = startParts(startTimeEt)
  const meeting = meetings.find((m) => m.endDate === today) ?? null
  if (!meeting) return null
  if (lastSyncedEventId === meeting.id) return null
  const slot = etWallClockToDate(today, hour, minute, now)
  if (now.getTime() < slot.getTime()) return null
  return meeting
}

export function cpiSyncDueRelease(
  releases: readonly CpiRelease[] = CPI_RELEASES,
  now = new Date(),
  startTimeEt = CPI_SYNC_DEFAULT_START_ET,
  lastSyncedEventId: string | null = null,
): CpiRelease | null {
  const today = etYmd(now)
  const { hour, minute } = startParts(startTimeEt)
  const release = releases.find((r) => r.releaseDate === today) ?? null
  if (!release) return null
  if (lastSyncedEventId === release.id) return null
  const slot = etWallClockToDate(today, hour, minute, now)
  if (now.getTime() < slot.getTime()) return null
  return release
}
