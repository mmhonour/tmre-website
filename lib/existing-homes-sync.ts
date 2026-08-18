import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  readNarHousingSeries,
  upsertNarHousingObservations,
} from '@/lib/db/existing-homes-repo'
import {
  EXISTING_HOMES_SERIES,
  NAR_PENDING_HOME_SALES_URL,
  type ExistingHomesObservation,
  type ExistingHomesSeriesData,
  type ExistingHomesSeriesId,
  type NarPendingSnapshot,
} from '@/lib/existing-homes-shared'

export const NAR_HOUSING_LAST_SYNC_KEY = 'nar_housing_last_synced_at'
export const NAR_HOUSING_LAST_RESULT_KEY = 'nar_housing_last_sync_result'
export const NAR_PENDING_LAST_SYNC_KEY = 'nar_pending_last_synced_at'
export const NAR_PENDING_SNAPSHOT_KEY = 'nar_pending_phsi_v1'

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const FETCH_TIMEOUT_MS = 25_000
const NAR_FETCH_TIMEOUT_MS = 15_000
const HISTORY_START = '1999-01-01'
const LAZY_REFRESH_MS = 12 * 60 * 60 * 1000

export function isFredConfigured(): boolean {
  return Boolean(process.env.FRED_API_KEY?.trim())
}

type FredObservationsResponse = {
  observations?: { date?: unknown; value?: unknown }[]
}

async function fetchFredSeries(
  seriesId: ExistingHomesSeriesId,
  apiKey: string,
  observationStart: string,
): Promise<
  | { ok: true; observations: ExistingHomesObservation[] }
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
    const observations: ExistingHomesObservation[] = []
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

export type NarHousingSyncResult = {
  ok: boolean
  syncedAt: string
  series: {
    seriesId: ExistingHomesSeriesId
    ok: boolean
    rows: number
    reason?: string
  }[]
  error?: string
}

export async function syncNarHousingFromFred(): Promise<NarHousingSyncResult> {
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

  const series: NarHousingSyncResult['series'] = []
  for (const meta of EXISTING_HOMES_SERIES) {
    const fetched = await fetchFredSeries(meta.id, apiKey, HISTORY_START)
    if (!fetched.ok) {
      series.push({ seriesId: meta.id, ok: false, rows: 0, reason: fetched.reason })
      continue
    }
    try {
      const rows = await upsertNarHousingObservations(meta.id, fetched.observations)
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
      await setSyncMetaDurable(NAR_HOUSING_LAST_SYNC_KEY, syncedAt)
    }
    await setSyncMetaDurable(NAR_HOUSING_LAST_RESULT_KEY, summary.slice(0, 600))
  } catch (err) {
    console.warn('[existing-homes] stamping sync_meta failed', err)
  }

  return { ok, syncedAt, series }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function signedPct(raw: string, verb?: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return NaN
  const down =
    verb != null &&
    /fell|decreased|declined|dropped|down/i.test(verb)
  return down ? -Math.abs(n) : Math.abs(n)
}

export function parseNarPendingHtml(html: string): Omit<
  NarPendingSnapshot,
  'sourceUrl' | 'fetchedAt'
> {
  const text = stripHtml(html)

  const headline = text.match(
    /Pending Home Sales Index[^.]{0,120}?(fell|rose|decreased|increased|declined|dropped)\s+([\d.]+)\s*%\s+in\s+([A-Za-z]+)\s+(\d{4})\s+to\s+([\d.]+)/i,
  )
  const fallbackIndex = text.match(
    /in\s+([A-Za-z]+)\s+(\d{4})\s+to\s+([\d.]+)/i,
  )
  const momLine = text.match(
    /Month over month[^.]{0,80}?(decreased|increased|fell|rose|declined)\s+by\s+([\d.]+)\s*%/i,
  )
  const yoyLine = text.match(
    /(decreased|increased|fell|rose|declined).{0,100}?([\d.]+)\s*%\s+year over year/i,
  )
  const next = text.match(
    /Next release:[^.]*?released on\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}[^.]{0,40})/i,
  )
  const northeast = text.match(
    /Northeast[^.]{0,140}?(?:to|was|at)\s+([\d.]+)/i,
  )

  const index = headline
    ? Number(headline[5])
    : fallbackIndex
      ? Number(fallbackIndex[3])
      : NaN
  const asOfLabel = headline
    ? `${headline[3]} ${headline[4]}`
    : fallbackIndex
      ? `${fallbackIndex[1]} ${fallbackIndex[2]}`
      : null
  const momPct = headline
    ? signedPct(headline[2], headline[1])
    : momLine
      ? signedPct(momLine[2], momLine[1])
      : NaN
  const yoyPct = yoyLine ? signedPct(yoyLine[2], yoyLine[1]) : NaN
  const northeastIndex = northeast ? Number(northeast[1]) : NaN

  const parseOk = Number.isFinite(index)
  return {
    index: parseOk ? index : null,
    asOfLabel,
    momPct: Number.isFinite(momPct) ? momPct : null,
    yoyPct: Number.isFinite(yoyPct) ? yoyPct : null,
    northeastIndex: Number.isFinite(northeastIndex) ? northeastIndex : null,
    nextRelease: next?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
    parseOk,
    error: parseOk ? undefined : 'Could not parse NAR pending snapshot',
  }
}

export async function syncNarPendingFromNar(): Promise<NarPendingSnapshot> {
  const fetchedAt = new Date().toISOString()
  const empty: NarPendingSnapshot = {
    index: null,
    asOfLabel: null,
    momPct: null,
    yoyPct: null,
    northeastIndex: null,
    nextRelease: null,
    sourceUrl: NAR_PENDING_HOME_SALES_URL,
    fetchedAt,
    parseOk: false,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NAR_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(NAR_PENDING_HOME_SALES_URL, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'tmre-website/0.1 (+https://tmrebuilder.com; nar-pending; respectful bot)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) {
      const snap = { ...empty, error: `HTTP ${res.status}` }
      await persistPendingSnapshot(snap)
      return snap
    }
    const parsed = parseNarPendingHtml(await res.text())
    const snap: NarPendingSnapshot = {
      ...parsed,
      sourceUrl: NAR_PENDING_HOME_SALES_URL,
      fetchedAt,
    }
    await persistPendingSnapshot(snap)
    return snap
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    const snap: NarPendingSnapshot = {
      ...empty,
      error:
        name === 'AbortError'
          ? `Timed out after ${NAR_FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : 'fetch failed',
    }
    try {
      await persistPendingSnapshot(snap)
    } catch {
      // keep the in-memory failure even if stamp write fails
    }
    return snap
  } finally {
    clearTimeout(timer)
  }
}

async function persistPendingSnapshot(snap: NarPendingSnapshot): Promise<void> {
  if (snap.parseOk) {
    await setSyncMetaDurable(NAR_PENDING_SNAPSHOT_KEY, JSON.stringify(snap))
  }
  await setSyncMetaDurable(NAR_PENDING_LAST_SYNC_KEY, snap.fetchedAt)
}

export async function readNarPendingSnapshot(): Promise<NarPendingSnapshot | null> {
  try {
    const raw = await getSyncMetaFresh(NAR_PENDING_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as NarPendingSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function readNarHousingSyncMeta(): Promise<{
  lastSyncedAt: string | null
  lastResult: string | null
  pendingSyncedAt: string | null
}> {
  try {
    const [at, result, pending] = await Promise.all([
      getSyncMetaFresh(NAR_HOUSING_LAST_SYNC_KEY),
      getSyncMetaFresh(NAR_HOUSING_LAST_RESULT_KEY),
      getSyncMetaFresh(NAR_PENDING_LAST_SYNC_KEY),
    ])
    return {
      lastSyncedAt: at ?? null,
      lastResult: result ?? null,
      pendingSyncedAt: pending ?? null,
    }
  } catch {
    return { lastSyncedAt: null, lastResult: null, pendingSyncedAt: null }
  }
}

function isFresh(iso: string | null): boolean {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) && Date.now() - ms < LAZY_REFRESH_MS
}

/**
 * Page-view guard: pull FRED + NAR pending only when stored data is older
 * than LAZY_REFRESH_MS. Never throws — a stale snapshot beats a 502.
 */
export async function ensureExistingHomesFresh(): Promise<void> {
  try {
    const meta = await readNarHousingSyncMeta()
    if (isFredConfigured() && !isFresh(meta.lastSyncedAt)) {
      await syncNarHousingFromFred()
    }
  } catch (err) {
    console.warn('[existing-homes] FRED lazy refresh failed', err)
  }
  try {
    const meta = await readNarHousingSyncMeta()
    if (!isFresh(meta.pendingSyncedAt)) {
      await syncNarPendingFromNar()
    }
  } catch (err) {
    console.warn('[existing-homes] NAR pending lazy refresh failed', err)
  }
}

function pickByOffsetMonths(
  observations: readonly ExistingHomesObservation[],
  monthsBack: number,
): ExistingHomesObservation | null {
  const latest = observations[observations.length - 1]
  if (!latest) return null
  const latestMs = Date.parse(latest.date)
  if (!Number.isFinite(latestMs)) return null
  const target = new Date(latestMs)
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() - monthsBack)
  const targetIso = target.toISOString().slice(0, 10)
  const exact = observations.find((obs) => obs.date.slice(0, 7) === targetIso.slice(0, 7))
  if (exact) return exact
  let best: ExistingHomesObservation | null = null
  let bestGap = Number.POSITIVE_INFINITY
  const targetMs = Date.parse(targetIso)
  for (const obs of observations) {
    const gap = Math.abs(Date.parse(obs.date) - targetMs)
    if (Number.isFinite(gap) && gap < bestGap) {
      bestGap = gap
      best = obs
    }
  }
  return bestGap <= 40 * 24 * 60 * 60 * 1000 ? best : null
}

export async function readExistingHomesSeries(): Promise<
  Record<ExistingHomesSeriesId, ExistingHomesSeriesData>
> {
  const entries = await Promise.all(
    EXISTING_HOMES_SERIES.map(async (meta) => {
      let observations: ExistingHomesObservation[] = []
      try {
        observations = await readNarHousingSeries(meta.id, HISTORY_START)
      } catch (err) {
        console.warn(`[existing-homes] read ${meta.id} failed`, err)
      }
      const data: ExistingHomesSeriesData = {
        seriesId: meta.id,
        observations,
        latest: observations[observations.length - 1] ?? null,
        priorMonth: pickByOffsetMonths(observations, 1),
        yearAgo: pickByOffsetMonths(observations, 12),
      }
      return [meta.id, data] as const
    }),
  )
  return Object.fromEntries(entries) as Record<
    ExistingHomesSeriesId,
    ExistingHomesSeriesData
  >
}
