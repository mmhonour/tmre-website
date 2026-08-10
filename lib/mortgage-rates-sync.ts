import 'server-only'

import {
  readMortgageSeries,
  upsertMortgageObservations,
} from '@/lib/db/mortgage-rates-repo'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  MORTGAGE_SERIES,
  type MortgageObservation,
  type MortgageSeriesData,
  type MortgageSeriesId,
} from '@/lib/mortgage-rates-shared'

export const MORTGAGE_RATES_LAST_SYNC_KEY = 'mortgage_rates_last_synced_at'
export const MORTGAGE_RATES_LAST_RESULT_KEY = 'mortgage_rates_last_sync_result'

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const FETCH_TIMEOUT_MS = 25_000
/**
 * Pull as far back as FRED will give for each series. OBMMI starts ~2015;
 * Freddie PMMS and Treasury CMTs go decades earlier. Chart lookback is filtered
 * client-side (1Y / 5Y / Max).
 */
const HISTORY_START = '1971-04-02'
/** Re-pull at most this often on a page view (publishers update daily/weekly). */
const LAZY_REFRESH_MS = 12 * 60 * 60 * 1000

export function isFredConfigured(): boolean {
  return Boolean(process.env.FRED_API_KEY?.trim())
}

type FredObservationsResponse = {
  observations?: { date?: unknown; value?: unknown }[]
}

async function fetchFredSeries(
  seriesId: MortgageSeriesId,
  apiKey: string,
  observationStart: string,
): Promise<
  | { ok: true; observations: MortgageObservation[] }
  | { ok: false; reason: string }
> {
  const url = new URL(FRED_BASE)
  url.searchParams.set('series_id', seriesId)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('observation_start', observationStart)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = (await res.json()) as FredObservationsResponse
    const observations: MortgageObservation[] = []
    for (const row of body.observations ?? []) {
      const date = typeof row.date === 'string' ? row.date : null
      const raw = typeof row.value === 'string' ? row.value : null
      if (!date || !raw || raw === '.') continue
      const value = Number(raw)
      if (!Number.isFinite(value)) continue
      observations.push({ date, value })
    }
    return { ok: true, observations }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    return {
      ok: false,
      reason:
        name === 'AbortError'
          ? `Timed out after ${FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : 'fetch failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

export type MortgageRatesSyncResult = {
  ok: boolean
  syncedAt: string
  series: {
    seriesId: MortgageSeriesId
    ok: boolean
    rows: number
    reason?: string
  }[]
  error?: string
}

/** Pull every catalog series from FRED into Neon. */
export async function syncMortgageRatesFromFred(): Promise<MortgageRatesSyncResult> {
  const syncedAt = new Date().toISOString()
  const apiKey = process.env.FRED_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      syncedAt,
      series: [],
      error: 'FRED_API_KEY is not set',
    }
  }

  const series: MortgageRatesSyncResult['series'] = []
  for (const meta of MORTGAGE_SERIES) {
    const fetched = await fetchFredSeries(meta.id, apiKey, HISTORY_START)
    if (!fetched.ok) {
      series.push({ seriesId: meta.id, ok: false, rows: 0, reason: fetched.reason })
      continue
    }
    try {
      const rows = await upsertMortgageObservations(meta.id, fetched.observations)
      series.push({ seriesId: meta.id, ok: true, rows })
    } catch (err) {
      series.push({
        seriesId: meta.id,
        ok: false,
        rows: 0,
        reason: err instanceof Error ? err.message : 'write failed',
      })
    }
  }

  const ok = series.length > 0 && series.every((s) => s.ok)
  const summary = series
    .map((s) => `${s.seriesId} ${s.ok ? `${s.rows} rows` : `FAILED (${s.reason})`}`)
    .join(' · ')
  try {
    if (series.some((s) => s.ok && s.rows > 0)) {
      await setSyncMetaDurable(MORTGAGE_RATES_LAST_SYNC_KEY, syncedAt)
    }
    await setSyncMetaDurable(MORTGAGE_RATES_LAST_RESULT_KEY, summary.slice(0, 600))
  } catch (err) {
    console.warn('[mortgage-rates] stamping sync_meta failed', err)
  }

  return { ok, syncedAt, series }
}

export async function readMortgageRatesSyncMeta(): Promise<{
  lastSyncedAt: string | null
  lastResult: string | null
}> {
  try {
    const [at, result] = await Promise.all([
      getSyncMetaFresh(MORTGAGE_RATES_LAST_SYNC_KEY),
      getSyncMetaFresh(MORTGAGE_RATES_LAST_RESULT_KEY),
    ])
    return { lastSyncedAt: at ?? null, lastResult: result ?? null }
  } catch {
    return { lastSyncedAt: null, lastResult: null }
  }
}

/**
 * Page-view guard: pull from FRED only when the stored data is older than
 * LAZY_REFRESH_MS. Never throws — a stale chart beats a 502.
 */
export async function ensureMortgageRatesFresh(): Promise<void> {
  if (!isFredConfigured()) return
  try {
    const { lastSyncedAt } = await readMortgageRatesSyncMeta()
    const lastMs = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN
    if (Number.isFinite(lastMs) && Date.now() - lastMs < LAZY_REFRESH_MS) return
    await syncMortgageRatesFromFred()
  } catch (err) {
    console.warn('[mortgage-rates] lazy refresh failed', err)
  }
}

function pickYearAgo(
  observations: readonly MortgageObservation[],
): MortgageObservation | null {
  const latest = observations[observations.length - 1]
  if (!latest) return null
  const targetMs = Date.parse(latest.date) - 365 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(targetMs)) return null
  let best: MortgageObservation | null = null
  let bestGap = Number.POSITIVE_INFINITY
  for (const obs of observations) {
    const gap = Math.abs(Date.parse(obs.date) - targetMs)
    if (Number.isFinite(gap) && gap < bestGap) {
      bestGap = gap
      best = obs
    }
  }
  // Only trust it as "a year ago" when we landed within ~5 weeks.
  return bestGap <= 35 * 24 * 60 * 60 * 1000 ? best : null
}

/** Full stored history for every catalog series, read from Neon (no FRED call). */
export async function readMortgageRateSeries(): Promise<
  Record<MortgageSeriesId, MortgageSeriesData>
> {
  const entries = await Promise.all(
    MORTGAGE_SERIES.map(async (meta) => {
      let observations: MortgageObservation[] = []
      try {
        observations = await readMortgageSeries(meta.id, HISTORY_START)
      } catch (err) {
        console.warn(`[mortgage-rates] read ${meta.id} failed`, err)
      }
      const data: MortgageSeriesData = {
        seriesId: meta.id,
        observations,
        latest: observations[observations.length - 1] ?? null,
        yearAgo: pickYearAgo(observations),
      }
      return [meta.id, data] as const
    }),
  )
  return Object.fromEntries(entries) as Record<
    MortgageSeriesId,
    MortgageSeriesData
  >
}
