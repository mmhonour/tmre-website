import 'server-only'

import {
  FOMC_MEETINGS,
  parseFomcYmd,
  type FomcMeeting,
} from '@/lib/fed-fomc-calendar'
import {
  ensureFomcMeetingsTable,
  listFomcMeetingsFromDb,
  upsertFomcMeeting,
} from '@/lib/db/fomc-meetings-repo'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  decisionFromRangeChange,
  guessFomcStatementUrl,
  parseFomcStatementHtml,
} from '@/lib/fed-fomc-statement-parse'

const FETCH_TIMEOUT_MS = 12_000

export type FedSyncMeetingResult = {
  id: string
  ok: boolean
  skipped?: boolean
  reason?: string
  statementUrl?: string | null
  summaryChars?: number
}

export type FedSyncResult = {
  ok: boolean
  syncedAt: string
  fetched: number
  updated: number
  skipped: number
  failed: number
  meetings: FedSyncMeetingResult[]
}

async function fetchStatementHtml(url: string): Promise<{
  ok: boolean
  status: number
  html: string | null
  reason?: string
}> {
  if (/\.pdf($|\?)/i.test(url)) {
    return {
      ok: false,
      status: 0,
      html: null,
      reason: 'PDF statements are not scraped yet — use the HTML press release when available',
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'tmre-website/0.1 (+https://tmrebuilder.com; fed-sync)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        html: null,
        reason: `HTTP ${res.status}`,
      }
    }
    const html = await res.text()
    return { ok: true, status: res.status, html }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    return {
      ok: false,
      status: 0,
      html: null,
      reason:
        name === 'AbortError'
          ? `Timed out after ${FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

function mergeSeedWithDb(
  seed: readonly FomcMeeting[],
  dbRows: FomcMeeting[],
): FomcMeeting[] {
  const byId = new Map(dbRows.map((m) => [m.id, m]))
  return seed.map((base) => {
    const overlay = byId.get(base.id)
    if (!overlay) return { ...base }
    return {
      ...base,
      ...overlay,
      // Keep seed calendar dates/SEP if overlay somehow omits them.
      startDate: overlay.startDate || base.startDate,
      endDate: overlay.endDate || base.endDate,
      hasSep: overlay.hasSep ?? base.hasSep,
      note: overlay.note ?? base.note,
    }
  })
}

/**
 * Seed calendar merged with Postgres overlays (summaries, synced decisions).
 * Falls back to the hand-maintained seed when the DB is unavailable.
 */
export async function getFomcMeetingsFresh(): Promise<FomcMeeting[]> {
  try {
    const dbRows = await listFomcMeetingsFromDb()
    return mergeSeedWithDb(FOMC_MEETINGS, dbRows)
  } catch {
    return FOMC_MEETINGS.map((m) => ({ ...m }))
  }
}

/**
 * Fetch official statements for past (and today's) meetings, extract range /
 * vote / summary text, and upsert into Postgres.
 */
export async function runFedFomcSync(options?: {
  /** Only sync this meeting id (e.g. 2026-07). */
  meetingId?: string
  /** Include future meetings that already have a statement URL. */
  includeUpcomingWithUrl?: boolean
}): Promise<FedSyncResult> {
  await ensureFomcMeetingsTable()
  const now = new Date()
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  )

  const existing = await listFomcMeetingsFromDb()
  const merged = mergeSeedWithDb(FOMC_MEETINGS, existing)
  const sorted = [...merged].sort(
    (a, b) => parseFomcYmd(a.endDate).getTime() - parseFomcYmd(b.endDate).getTime(),
  )

  const targets = sorted.filter((m) => {
    if (options?.meetingId) return m.id === options.meetingId
    const end = parseFomcYmd(m.endDate)
    if (end.getTime() <= endOfToday.getTime()) return true
    return Boolean(options?.includeUpcomingWithUrl && m.statementUrl)
  })

  const results: FedSyncMeetingResult[] = []
  let updated = 0
  let skipped = 0
  let failed = 0
  let fetched = 0

  for (let i = 0; i < targets.length; i++) {
    const meeting = targets[i]!
    const prev = sorted
      .slice(0, sorted.findIndex((m) => m.id === meeting.id))
      .filter((m) => m.targetRangeLow != null)
      .at(-1)

    const statementUrl =
      meeting.statementUrl?.trim() || guessFomcStatementUrl(meeting.endDate)

    const fetchResult = await fetchStatementHtml(statementUrl)
    if (!fetchResult.ok || !fetchResult.html) {
      // Keep seed facts; don't fail the whole run for one missing URL.
      const skipReason =
        fetchResult.status === 404
          ? 'Statement not posted yet (404)'
          : fetchResult.reason?.includes('PDF')
            ? fetchResult.reason
            : null
      if (skipReason) {
        skipped += 1
        results.push({
          id: meeting.id,
          ok: true,
          skipped: true,
          reason: skipReason,
          statementUrl,
        })
        continue
      }
      failed += 1
      results.push({
        id: meeting.id,
        ok: false,
        reason: fetchResult.reason ?? 'Fetch failed',
        statementUrl,
      })
      continue
    }

    fetched += 1
    const parsed = parseFomcStatementHtml(fetchResult.html)
    if (!parsed.summary && parsed.targetRangeLow == null) {
      failed += 1
      results.push({
        id: meeting.id,
        ok: false,
        reason: 'Could not parse statement body',
        statementUrl,
      })
      continue
    }

    const { decision, basisPoints } = decisionFromRangeChange(
      prev?.targetRangeLow ?? null,
      prev?.targetRangeHigh ?? null,
      parsed.targetRangeLow,
      parsed.targetRangeHigh,
      parsed.decisionHint,
    )

    const next: FomcMeeting = {
      ...meeting,
      statementUrl,
      decision: decision ?? meeting.decision,
      basisPoints: basisPoints ?? meeting.basisPoints,
      targetRangeLow: parsed.targetRangeLow ?? meeting.targetRangeLow,
      targetRangeHigh: parsed.targetRangeHigh ?? meeting.targetRangeHigh,
      summary: parsed.summary,
      excerpt: parsed.excerpt,
      voteNote: parsed.voteNote,
      note: meeting.note,
    }

    await upsertFomcMeeting(next)
    updated += 1
    results.push({
      id: meeting.id,
      ok: true,
      statementUrl,
      summaryChars: parsed.summary?.length ?? 0,
    })
  }

  const syncedAt = new Date().toISOString()
  const summaryLine = `fetched=${fetched} updated=${updated} skipped=${skipped} failed=${failed}`
  try {
    await setSyncMetaDurable('fomc_last_synced_at', syncedAt)
    await setSyncMetaDurable('fomc_last_sync_result', summaryLine)
  } catch {
    // sync_meta write is best-effort
  }

  return {
    ok: failed === 0,
    syncedAt,
    fetched,
    updated,
    skipped,
    failed,
    meetings: results,
  }
}
