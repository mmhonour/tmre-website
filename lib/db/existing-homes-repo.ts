import 'server-only'

import { query } from '@/lib/db/postgres'
import type {
  ExistingHomesObservation,
  ExistingHomesSeriesId,
} from '@/lib/existing-homes-shared'

let ensured = false

export async function ensureNarHousingTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS nar_housing (
      series_id  text NOT NULL,
      obs_date   date NOT NULL,
      value      numeric NOT NULL,
      synced_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (series_id, obs_date)
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_nar_housing_series_date
      ON nar_housing (series_id, obs_date DESC)
  `)
  ensured = true
}

type ObservationRow = {
  obs_date: Date | string
  value: string | number
}

function isoDate(raw: Date | string): string {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw).slice(0, 10)
}

function toNum(raw: string | number): number {
  return typeof raw === 'number' ? raw : Number(raw)
}

export async function readNarHousingSeries(
  seriesId: ExistingHomesSeriesId,
  sinceDate: string,
): Promise<ExistingHomesObservation[]> {
  await ensureNarHousingTable()
  const rows = await query<ObservationRow>(
    `SELECT obs_date, value
       FROM nar_housing
      WHERE series_id = $1
        AND obs_date >= $2::date
      ORDER BY obs_date ASC`,
    [seriesId, sinceDate],
  )
  return rows
    .map((row) => ({ date: isoDate(row.obs_date), value: toNum(row.value) }))
    .filter((row) => Number.isFinite(row.value))
}

export async function upsertNarHousingObservations(
  seriesId: ExistingHomesSeriesId,
  observations: readonly ExistingHomesObservation[],
): Promise<number> {
  if (observations.length === 0) return 0
  await ensureNarHousingTable()

  const CHUNK = 500
  let written = 0
  for (let i = 0; i < observations.length; i += CHUNK) {
    const chunk = observations.slice(i, i + CHUNK)
    const values: unknown[] = [seriesId]
    const tuples = chunk.map((obs) => {
      values.push(obs.date, obs.value)
      return `($1, $${values.length - 1}::date, $${values.length}::numeric)`
    })
    await query(
      `INSERT INTO nar_housing (series_id, obs_date, value)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (series_id, obs_date) DO UPDATE SET
         value = EXCLUDED.value,
         synced_at = now()`,
      values,
    )
    written += chunk.length
  }
  return written
}
