import 'server-only'

import { query } from '@/lib/db/postgres'
import {
  type MortgageObservation,
  type MortgageSeriesId,
} from '@/lib/mortgage-rates-shared'

let ensured = false

export async function ensureMortgageRatesTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS mortgage_rates (
      series_id  text NOT NULL,
      obs_date   date NOT NULL,
      value      numeric NOT NULL,
      synced_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (series_id, obs_date)
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_mortgage_rates_series_date
      ON mortgage_rates (series_id, obs_date DESC)
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

/** Observations for one series, oldest first, limited to `sinceDate` onward. */
export async function readMortgageSeries(
  seriesId: MortgageSeriesId,
  sinceDate: string,
): Promise<MortgageObservation[]> {
  await ensureMortgageRatesTable()
  const rows = await query<ObservationRow>(
    `SELECT obs_date, value
       FROM mortgage_rates
      WHERE series_id = $1
        AND obs_date >= $2::date
      ORDER BY obs_date ASC`,
    [seriesId, sinceDate],
  )
  return rows
    .map((row) => ({ date: isoDate(row.obs_date), value: toNum(row.value) }))
    .filter((row) => Number.isFinite(row.value))
}

export async function upsertMortgageObservations(
  seriesId: MortgageSeriesId,
  observations: readonly MortgageObservation[],
): Promise<number> {
  if (observations.length === 0) return 0
  await ensureMortgageRatesTable()

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
      `INSERT INTO mortgage_rates (series_id, obs_date, value)
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

/** Row counts per series — Admin diagnostics. */
export async function readMortgageRateCounts(): Promise<
  { seriesId: string; rows: number; latestDate: string | null }[]
> {
  await ensureMortgageRatesTable()
  const rows = await query<{
    series_id: string
    rows: number
    latest: Date | string | null
  }>(
    `SELECT series_id,
            count(*)::int AS rows,
            max(obs_date)  AS latest
       FROM mortgage_rates
      GROUP BY series_id
      ORDER BY series_id ASC`,
  )
  return rows.map((row) => ({
    seriesId: row.series_id,
    rows: row.rows,
    latestDate: row.latest ? isoDate(row.latest) : null,
  }))
}
