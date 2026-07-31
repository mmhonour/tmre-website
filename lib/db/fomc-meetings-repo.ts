import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import type { FomcDecision, FomcMeeting } from '@/lib/fed-fomc-calendar'

let ensured = false

export async function ensureFomcMeetingsTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS fomc_meetings (
      id                 text PRIMARY KEY,
      start_date         text NOT NULL,
      end_date           text NOT NULL,
      has_sep            boolean NOT NULL DEFAULT false,
      decision           text,
      basis_points       integer,
      target_range_low   numeric,
      target_range_high  numeric,
      statement_url      text,
      note               text,
      summary            text,
      excerpt            text,
      vote_note          text,
      synced_at          timestamptz NOT NULL DEFAULT now(),
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_fomc_meetings_end_date
      ON fomc_meetings (end_date DESC)
  `)
  ensured = true
}

type FomcMeetingRow = {
  id: string
  start_date: string
  end_date: string
  has_sep: boolean
  decision: string | null
  basis_points: number | null
  target_range_low: string | number | null
  target_range_high: string | number | null
  statement_url: string | null
  note: string | null
  summary: string | null
  excerpt: string | null
  vote_note: string | null
  synced_at: Date | string
}

function toNum(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asDecision(value: string | null): FomcDecision | null {
  if (value === 'cut' || value === 'hold' || value === 'hike') return value
  return null
}

function rowToMeeting(row: FomcMeetingRow): FomcMeeting {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    hasSep: Boolean(row.has_sep),
    decision: asDecision(row.decision),
    basisPoints:
      row.basis_points == null ? null : Math.round(Number(row.basis_points)),
    targetRangeLow: toNum(row.target_range_low),
    targetRangeHigh: toNum(row.target_range_high),
    statementUrl: row.statement_url,
    note: row.note ?? undefined,
    summary: row.summary,
    excerpt: row.excerpt,
    voteNote: row.vote_note,
    syncedAt:
      row.synced_at instanceof Date
        ? row.synced_at.toISOString()
        : String(row.synced_at),
  }
}

export async function listFomcMeetingsFromDb(): Promise<FomcMeeting[]> {
  await ensureFomcMeetingsTable()
  const rows = await query<FomcMeetingRow>(
    `SELECT id, start_date, end_date, has_sep, decision, basis_points,
            target_range_low, target_range_high, statement_url, note,
            summary, excerpt, vote_note, synced_at
     FROM fomc_meetings
     ORDER BY end_date ASC`,
  )
  return rows.map(rowToMeeting)
}

export async function upsertFomcMeeting(meeting: FomcMeeting): Promise<void> {
  await ensureFomcMeetingsTable()
  await query(
    `INSERT INTO fomc_meetings (
       id, start_date, end_date, has_sep, decision, basis_points,
       target_range_low, target_range_high, statement_url, note,
       summary, excerpt, vote_note, synced_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now()
     )
     ON CONFLICT (id) DO UPDATE SET
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       has_sep = EXCLUDED.has_sep,
       decision = COALESCE(EXCLUDED.decision, fomc_meetings.decision),
       basis_points = COALESCE(EXCLUDED.basis_points, fomc_meetings.basis_points),
       target_range_low = COALESCE(EXCLUDED.target_range_low, fomc_meetings.target_range_low),
       target_range_high = COALESCE(EXCLUDED.target_range_high, fomc_meetings.target_range_high),
       statement_url = COALESCE(EXCLUDED.statement_url, fomc_meetings.statement_url),
       note = COALESCE(EXCLUDED.note, fomc_meetings.note),
       summary = COALESCE(EXCLUDED.summary, fomc_meetings.summary),
       excerpt = COALESCE(EXCLUDED.excerpt, fomc_meetings.excerpt),
       vote_note = COALESCE(EXCLUDED.vote_note, fomc_meetings.vote_note),
       synced_at = now(),
       updated_at = now()`,
    [
      meeting.id,
      meeting.startDate,
      meeting.endDate,
      meeting.hasSep,
      meeting.decision,
      meeting.basisPoints,
      meeting.targetRangeLow,
      meeting.targetRangeHigh,
      meeting.statementUrl,
      meeting.note ?? null,
      meeting.summary ?? null,
      meeting.excerpt ?? null,
      meeting.voteNote ?? null,
    ],
  )
}

export async function readFomcSyncMeta(): Promise<{
  lastSyncedAt: string | null
  lastResult: string | null
}> {
  await ensureFomcMeetingsTable()
  try {
    const [at, result] = await Promise.all([
      queryOne<{ value: string }>(
        `SELECT value FROM sync_meta WHERE key = 'fomc_last_synced_at'`,
      ),
      queryOne<{ value: string }>(
        `SELECT value FROM sync_meta WHERE key = 'fomc_last_sync_result'`,
      ),
    ])
    return {
      lastSyncedAt: at?.value ?? null,
      lastResult: result?.value ?? null,
    }
  } catch {
    return { lastSyncedAt: null, lastResult: null }
  }
}
