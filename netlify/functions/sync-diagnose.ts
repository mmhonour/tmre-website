import type { Config, Context } from '@netlify/functions'
import { assertSyncCronAuth } from '../../lib/netlify-cron-auth'
import {
  getSyncMeta,
  hydrateSyncMetaStore,
  setSyncMetaDurable,
} from '../../lib/db/sync-meta-store'
import { query } from '../../lib/db/postgres'
import { searchListings } from '../../lib/rets'
import {
  getActiveListingsFetchLimit,
  isMarketListing,
} from '../../lib/listings-store'
import { incrementalWatermark } from '../../lib/listings-sync'
import { readStatsCacheRow } from '../../lib/db/stats-cache-repo'
import { LATEST_GLOBAL_FEED_CACHE_KEY } from '../../lib/latest-feed-cache'
import { TMRE_TOWNS, type TmreTown } from '../../lib/tmre-towns'

/**
 * Read-only production probe: proves (or disproves) that a Lambda can reach
 * RETS, see today's changes, and write durably to Neon — WITHOUT upserting
 * inventory. Never scheduled; invoke by hand or via scripts/verify-serverless-pull.mjs.
 *
 * Modes
 *   probe        (default) one town + status: RETS count vs limit, Neon counts, feed age
 *   defer-write  start fire-and-forget work then return — mirrors warmLatestTownFeedsDeferred
 *   defer-check  read the marker defer-write should have left
 *
 * Truncation is the point of `returned`/`limit`: RETS has no pagination
 * (lib/rets.ts searchListings uses a single offset:1 query), so returned === limit
 * means the MLS had more matches than we asked for and the remainder was dropped.
 */

const DEFER_MARKER_KEY = 'diag_deferred_marker'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isTmreTown(value: string): value is TmreTown {
  return (TMRE_TOWNS as readonly string[]).includes(value)
}

function runtimeFacts() {
  return {
    lambda: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME),
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME ?? null,
    region: process.env.AWS_REGION ?? null,
    node: process.version,
    deployId: process.env.DEPLOY_ID ?? null,
    context: process.env.CONTEXT ?? null,
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    retsLoginPresent: Boolean(process.env.RETS_LOGIN_URL),
    cronSecretPresent: Boolean(process.env.SYNC_CRON_SECRET),
  }
}

async function feedCacheFacts() {
  try {
    const row = await readStatsCacheRow(LATEST_GLOBAL_FEED_CACHE_KEY)
    if (!row?.payload) {
      return { present: false, generatedAt: null, ageMinutes: null, listings: 0 }
    }
    const parsed = JSON.parse(row.payload) as {
      generatedAt?: string
      listings?: unknown[]
    }
    const generatedAt = parsed?.generatedAt ?? row.computedAt ?? null
    const ageMinutes = generatedAt
      ? Math.round((Date.now() - Date.parse(generatedAt)) / 60_000)
      : null
    return {
      present: true,
      generatedAt,
      ageMinutes,
      listings: Array.isArray(parsed?.listings) ? parsed.listings.length : 0,
    }
  } catch (err) {
    return {
      present: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function neonFacts(town: TmreTown) {
  const [row] = await query<{
    active_total: number
    modified_36h: number
    newest_mod: string | null
    listed_today: number
  }>(
    `SELECT
       COUNT(*)::int AS active_total,
       COUNT(*) FILTER (
         WHERE modification_timestamp > NOW() - INTERVAL '36 hours'
       )::int AS modified_36h,
       MAX(modification_timestamp)::text AS newest_mod,
       COUNT(*) FILTER (
         WHERE list_date >= (NOW() AT TIME ZONE 'America/New_York')::date
       )::int AS listed_today
     FROM listings
     WHERE status_bucket = 'Active' AND town = $1`,
    [town],
  )
  return {
    activeTotal: row?.active_total ?? 0,
    modifiedLast36h: row?.modified_36h ?? 0,
    newestModificationTimestamp: row?.newest_mod ?? null,
    listedToday: row?.listed_today ?? 0,
  }
}

export default async function handler(req: Request, _context: Context) {
  const t0 = Date.now()
  if (!assertSyncCronAuth(req)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'probe'
  const townParam = url.searchParams.get('town') ?? 'Norwalk'
  const status = url.searchParams.get('status') ?? 'Active'
  const limitParam = Number(url.searchParams.get('limit'))

  try {
    await hydrateSyncMetaStore()

    if (mode === 'defer-write') {
      // Deliberately mirrors warmLatestTownFeedsDeferred: void'd promise with a
      // sleep, started before the response. If Netlify freezes the sandbox on
      // return, the marker never lands — which is the whole hypothesis.
      const startedAt = new Date().toISOString()
      void (async () => {
        try {
          await sleep(1_500)
          await setSyncMetaDurable(
            DEFER_MARKER_KEY,
            JSON.stringify({ startedAt, wroteAt: new Date().toISOString() }),
          )
        } catch (err) {
          console.error('[sync-diagnose] deferred write failed', err)
        }
      })()
      return json({
        ok: true,
        mode,
        startedAt,
        note: 'deferred write scheduled (1.5s); call mode=defer-check in ~30s',
        runtime: runtimeFacts(),
        totalMs: Date.now() - t0,
      })
    }

    if (mode === 'defer-check') {
      const raw = getSyncMeta(DEFER_MARKER_KEY)
      let parsed: { startedAt?: string; wroteAt?: string } | null = null
      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = null
      }
      return json({
        ok: true,
        mode,
        deferredWriteLanded: Boolean(parsed?.wroteAt),
        marker: parsed,
        verdict: parsed?.wroteAt
          ? 'fire-and-forget survived on this deploy'
          : 'no marker — post-response work did NOT complete (freeze confirmed)',
        runtime: runtimeFacts(),
        totalMs: Date.now() - t0,
      })
    }

    if (!isTmreTown(townParam)) {
      return json({ error: `unknown town: ${townParam}`, towns: TMRE_TOWNS }, 400)
    }
    const town = townParam

    const configuredLimit = getActiveListingsFetchLimit()
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.round(limitParam)
      : configuredLimit
    const modifiedAfter = incrementalWatermark()

    // Same call the incremental sync makes, minus the upsert.
    const retsStart = Date.now()
    const raw = await searchListings({
      city: town,
      status,
      limit,
      modifiedAfter,
    })
    const retsMs = Date.now() - retsStart
    const marketRows = raw.filter(isMarketListing)

    const neonStart = Date.now()
    const neon = await neonFacts(town)
    const neonMs = Date.now() - neonStart

    // Prove a Lambda can write durably to Neon (scratch key, not inventory).
    let durableWrite: { ok: boolean; error?: string } = { ok: false }
    try {
      await setSyncMetaDurable(
        'diag_last_probe',
        JSON.stringify({ at: new Date().toISOString(), town, status }),
      )
      durableWrite = { ok: true }
    } catch (err) {
      durableWrite = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    const truncated = raw.length >= limit

    return json({
      ok: true,
      mode: 'probe',
      runtime: runtimeFacts(),
      window: {
        modifiedAfter,
        lookbackHours:
          Math.round(((Date.now() - Date.parse(modifiedAfter)) / 3_600_000) * 10) / 10,
        lastIncrementalSync: getSyncMeta('last_incremental_sync'),
        lastIncrementalStarted: getSyncMeta('last_incremental_sync_started'),
        lastFullSync: getSyncMeta('last_full_sync'),
        refreshInProgress: getSyncMeta('refresh_in_progress') === '1',
      },
      fetch: {
        town,
        status,
        limit,
        configuredLimit,
        returned: raw.length,
        afterMarketFilter: marketRows.length,
        truncated,
        verdict: truncated
          ? `TRUNCATED — MLS had at least ${limit} matches and there is no pagination; newest rows may be missing`
          : 'complete — fewer matches than the limit, nothing dropped',
        newestModifiedInPull:
          marketRows
            .map((l) => l.modificationTimestamp ?? null)
            .filter((v): v is string => Boolean(v))
            .sort()
            .at(-1) ?? null,
      },
      neon,
      feedCache: await feedCacheFacts(),
      durableWrite,
      timing: { retsMs, neonMs, totalMs: Date.now() - t0 },
    })
  } catch (err) {
    console.error('[sync-diagnose]', err)
    return json(
      {
        ok: false,
        mode,
        error: err instanceof Error ? err.message : String(err),
        runtime: runtimeFacts(),
        totalMs: Date.now() - t0,
      },
      500,
    )
  }
}

// No schedule, no background — this must answer inline so the caller sees timings.
export const config: Config = {}
