import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import type { MarketDigestSnapshot } from '@/lib/market-digest-types'

/**
 * Same DDL as db/migrations/0031_market_pulse_snapshots.sql. Netlify does not
 * run migrations on deploy, so the table has to appear from the app side too.
 */
let ensured: Promise<void> | null = null

export async function ensureMarketPulseSnapshotsTable(): Promise<void> {
  if (ensured) return ensured
  ensured = (async () => {
    await execute(`
      CREATE TABLE IF NOT EXISTS market_pulse_snapshots (
        slot_date    date PRIMARY KEY,
        generated_at timestamptz NOT NULL,
        sent_at      timestamptz,
        source       text NOT NULL,
        payload      jsonb NOT NULL,
        stored_at    timestamptz NOT NULL DEFAULT now()
      )
    `)
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_market_pulse_snapshots_stored_at
        ON market_pulse_snapshots (stored_at DESC)
    `)
  })().catch((err) => {
    ensured = null
    throw err
  })
  return ensured
}

export type MarketPulseSnapshotSource = 'send' | 'backfill'

export type MarketPulseSnapshotRow = {
  slotDate: string
  generatedAt: string
  sentAt: string | null
  source: MarketPulseSnapshotSource
  payload: MarketDigestSnapshot
  storedAt: string
}

type SnapshotSqlRow = {
  slot_date: Date | string
  generated_at: Date | string
  sent_at: Date | string | null
  source: string
  payload: MarketDigestSnapshot
  stored_at: Date | string
}

function isoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function isoStamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapRow(row: SnapshotSqlRow): MarketPulseSnapshotRow {
  return {
    slotDate: isoDate(row.slot_date),
    generatedAt: isoStamp(row.generated_at),
    sentAt: row.sent_at == null ? null : isoStamp(row.sent_at),
    source: row.source === 'send' ? 'send' : 'backfill',
    payload: row.payload,
    storedAt: isoStamp(row.stored_at),
  }
}

/**
 * One row per Eastern send-day. A retry or a same-week backfill overwrites
 * the payload rather than creating a second week.
 */
export async function upsertMarketPulseSnapshot(input: {
  slotDate: string
  generatedAt: string
  sentAt: string | null
  source: MarketPulseSnapshotSource
  payload: MarketDigestSnapshot
}): Promise<void> {
  await ensureMarketPulseSnapshotsTable()
  await execute(
    `INSERT INTO market_pulse_snapshots
       (slot_date, generated_at, sent_at, source, payload, stored_at)
     VALUES ($1::date, $2::timestamptz, $3::timestamptz, $4, $5::jsonb, now())
     ON CONFLICT (slot_date) DO UPDATE SET
       generated_at = EXCLUDED.generated_at,
       sent_at = COALESCE(EXCLUDED.sent_at, market_pulse_snapshots.sent_at),
       source = EXCLUDED.source,
       payload = EXCLUDED.payload,
       stored_at = now()`,
    [
      input.slotDate,
      input.generatedAt,
      input.sentAt,
      input.source,
      JSON.stringify(input.payload),
    ],
  )
}

export async function readMarketPulseSnapshot(
  slotDate: string,
): Promise<MarketPulseSnapshotRow | null> {
  await ensureMarketPulseSnapshotsTable()
  const row = await queryOne<SnapshotSqlRow>(
    `SELECT slot_date, generated_at, sent_at, source, payload, stored_at
       FROM market_pulse_snapshots
      WHERE slot_date = $1::date`,
    [slotDate],
  )
  return row ? mapRow(row) : null
}

export async function listMarketPulseSnapshots(
  limit = 60,
): Promise<MarketPulseSnapshotRow[]> {
  await ensureMarketPulseSnapshotsTable()
  const rows = await query<SnapshotSqlRow>(
    `SELECT slot_date, generated_at, sent_at, source, payload, stored_at
       FROM market_pulse_snapshots
      ORDER BY slot_date DESC
      LIMIT $1`,
    [Math.max(1, Math.min(limit, 200))],
  )
  return rows.map(mapRow)
}
