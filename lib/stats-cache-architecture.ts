import { STATS_CACHE_SWEEP_MS, STATS_CACHE_TTL_MS } from '@/lib/stats-cache'
import { STATS_TOWN_MAX_AGE_MS } from '@/lib/stats-dirty-towns'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

// ---------------------------------------------------------------------------
// Operator-facing description of how the stats cache gets rebuilt.
//
// Rendered on /admin → Syncs → Overview (AdminStatsCacheDiagram). Keep this in
// step with the code it describes:
//   * lib/db/listings-repo.ts   — statsChanged on upsert (what marks a town)
//   * lib/stats-dirty-towns.ts  — the marks, the backstop, the run summary
//   * lib/stats-cache.ts        — rebuildStatsCache / …ForTowns, projection reads
//   * services/mls-sync/server.ts — Railway sweep (enqueues) + job-runner (claims)
//   * netlify/functions/sync-stats-cache*.ts — the other enqueuer, and the rescue
// ---------------------------------------------------------------------------

export type StatsCacheStageStatus = 'live' | 'guard' | 'fallback' | 'retired'

export type StatsCacheStage = {
  id: string
  title: string
  /** Where the step executes: Railway, Netlify, Neon, or the Node process. */
  host: string
  /** File that owns the behaviour. */
  source: string
  detail: string
  status: StatsCacheStageStatus
  statusLabel: string
}

export type StatsCacheLane = {
  id: string
  title: string
  subtitle: string
  stages: StatsCacheStage[]
}

export type StatsCacheArchitecture = {
  context: {
    towns: number
    sweepMinutes: number
    backstopHours: number
    reportedStaleMinutes: number
  }
  lanes: StatsCacheLane[]
}

/** Describe the rebuild path shown on Admin → Syncs → Overview. */
export function describeStatsCacheArchitecture(): StatsCacheArchitecture {
  const sweepMinutes = Math.round(STATS_CACHE_SWEEP_MS / 60_000)
  const backstopHours = Math.round(STATS_TOWN_MAX_AGE_MS / 3_600_000)

  return {
    context: {
      towns: TMRE_TOWNS.length,
      sweepMinutes,
      backstopHours,
      reportedStaleMinutes: Math.round(STATS_CACHE_TTL_MS / 60_000),
    },
    lanes: [
      {
        id: 'mark',
        title: '1 · What marks a town',
        subtitle: 'RETS → Neon writes decide when stats are out of date',
        stages: [
          {
            id: 'upsert',
            title: 'Incremental upsert compares stats inputs',
            host: 'Railway mls-sync',
            source: 'lib/db/listings-repo.ts → upsertListing',
            detail:
              'Each write already reads the existing row. It now compares the fields a stats payload is built from — price, MLS status, status bucket, close price, original list price, close date, list date, and DOM — and returns statsChanged. Photo, remark, and agent churn changes nothing, so a re-fetched-but-identical row does not trigger a rebuild.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'dom',
            title: 'DOM is the daily heartbeat',
            host: 'MLS field',
            source: 'lib/db/listings-repo.ts → statsSignature',
            detail:
              'The MLS increments DaysOnMarket once a day for every live listing, and DOM is in the compared set. That is what gives each town with inventory a once-a-day rebuild without a calendar job.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'marks',
            title: 'One sync_meta row per dirty town',
            host: 'Neon Postgres',
            source: 'lib/stats-dirty-towns.ts',
            detail:
              'stats_dirty:<Town> holds the first unconsumed stats-moving write; stats_built:<Town> holds the last successful rebuild. Marking is a single INSERT … ON CONFLICT DO NOTHING, so Netlify and Railway cannot lose each other\'s marks.',
            status: 'live',
            statusLabel: 'Live',
          },
        ],
      },
      {
        id: 'trigger',
        title: '2 · What starts a rebuild',
        subtitle: 'Dirty towns and a per-town backstop — not a clock',
        stages: [
          {
            id: 'sweep',
            title: `Railway sweep every ${sweepMinutes} min → sync_queue`,
            host: 'Railway mls-sync',
            source: 'services/mls-sync/server.ts → sweepTick',
            detail: `One small sync_meta read. It enqueues only when a town is dirty, never-built, or past the ${backstopHours}h backstop and the Configure slot has come round, and it enqueues nothing when the job is paused. Enqueueing rather than running means a rebuild asked for while an incremental pull is in flight waits its turn instead of being dropped.`,
            status: 'live',
            statusLabel: 'Enqueues',
          },
          {
            id: 'claim',
            title: 'Runner claims the row and forks a child',
            host: 'Railway mls-sync',
            source: 'services/mls-sync/job-runner.ts → drainSyncQueueOnce',
            detail:
              'One job at a time, highest priority first, oldest first within a band. The rebuild runs in its own process with its own heap, held to Configure → Stats cache → Budget: over budget is a kill recorded as timeout, and a child that dies silently is recorded as crashed. Either way the row reaches a terminal state, so the next sweep is not blocked by a ghost.',
            status: 'live',
            statusLabel: 'Runs it',
          },
          {
            id: 'netlify',
            title: 'Netlify thin cron */30 → enqueue, or rescue',
            host: 'Netlify',
            source: 'netlify/functions/sync-stats-cache.ts',
            detail:
              'The second enqueuer. It still checks for dirty towns before spending anything — the background hop is what Netlify began refusing with HTTP 429 — and normally just puts a row on the queue. It only queues its own background worker when that row has sat unclaimed past the rescue grace, which is how a dead runner stops meaning stale stats. Admin "Sync now" sends source=admin, which rebuilds all towns.',
            status: 'fallback',
            statusLabel: 'Enqueue + rescue',
          },
          {
            id: 'ttl',
            title: 'Hourly TTL rebuild',
            host: '—',
            source: 'lib/stats-cache.ts → rebuildStatsCacheIfStale',
            detail: `Retired. STATS_CACHE_TTL_MS is now only an age readout (a payload is *reported* old after ${Math.round(
              STATS_CACHE_TTL_MS / 60_000,
            )} min). Nothing rebuilds because an hour passed; a cache where no number moved is left alone.`,
            status: 'retired',
            statusLabel: 'Retired',
          },
          {
            id: 'cooldown',
            title: 'Post-failure cooldown (30 min)',
            host: 'Neon Postgres',
            source: 'lib/sync-queue.ts → SYNC_QUEUE_FAILURE_COOLDOWN_MS',
            detail:
              'A run that timed out or crashed holds the job back for 30 minutes. Without it, a rebuild fatal enough to kill its child would be re-enqueued on every sweep and starve everything behind it. An honest failure — a real error, an empty result — is not cooled down; it retries on the next slot like it always did. Admin "Sync now" skips the cooldown, because somebody pressed the button precisely because they did not believe it.',
            status: 'guard',
            statusLabel: 'Guard',
          },
          {
            id: 'reaper',
            title: 'Abandoned running rows are reaped',
            host: 'Neon Postgres',
            source: 'lib/sync-queue.ts → reapAbandonedSyncQueueItems',
            detail:
              'The runner heartbeats its claimed row every minute. A row that has gone five minutes without one is closed as crashed — the case where the parent itself died mid-run. Otherwise the unique index on running rows would block that job forever, which is the in-memory wedge again with a longer memory.',
            status: 'guard',
            statusLabel: 'Guard',
          },
        ],
      },
      {
        id: 'compute',
        title: '3 · How it computes',
        subtitle: 'One town at a time in Node; market-wide numbers in Postgres',
        stages: [
          {
            id: 'projection',
            title: 'Stats reads project columns instead of shipping raw',
            host: 'Neon Postgres',
            source: 'lib/db/listings-repo.ts → readStatsListingsFromDb',
            detail:
              'The rebuild used to load every listing\'s full raw RETS payload into Node — that JSON.parse is what hit the heap limit on Railway. Stats reads now build a minimal raw object in SQL (close date/price, MLS status, and the four rental hints) and drop the rest. The forked child means the heap it does use is its own: MLS_SYNC_CHILD_MAX_OLD_SPACE_MB caps it, and hitting that cap fails one job instead of the service.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'scope',
            title: 'Per-town rebuild, then bundles and All',
            host: 'Railway / Netlify',
            source: 'lib/stats-cache.ts → rebuildStatsCacheForTowns',
            detail: `Each dirty town's market stats are recomputed, then the by-town bundles and the All-towns aggregates are refreshed from the town caches. Passing every town falls through to the full-cache path. Payloads are upserted, never wiped, so a failed rebuild leaves the previous numbers readable. Peak memory is one town: nothing is held past its turn in the loop, months supply is written while that town's listings are still in hand, and no code path loads more than one town's listings at a time.`,
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'rollup',
            title: 'All-towns payloads are summed, not recomputed',
            host: 'Railway / Netlify',
            source: 'lib/stats-compute.ts → rollupSalesByPrice, rollupActiveByPrice, …',
            detail:
              'Price and vintage histograms, inventory segments, Goldilocks-by-vintage, and months supply are additive: the market number is the sum of the town numbers. They are now added up from the per-town rows already in stats_cache. Shares, top buckets, and the hover explanations are recomputed from the summed counts by the same helpers the per-town path uses, so the two cannot word or round a number differently.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'aggregate',
            title: 'Median and means come from one SQL aggregate',
            host: 'Neon Postgres',
            source: 'lib/db/stats-aggregates-repo.ts → readMarketStatsPools',
            detail:
              'market-stats:All is the one payload that cannot be summed — a median needs the whole distribution, and means need their own denominators. One query returns every pool as a count plus its percentile_cont(0.5) / avg, and marketStatsFromPools() formats those into the same payload shape the per-town path produces. Reading every Active and Closed listing in the market to reduce them in Node is what exhausted V8\'s heap, and that cost grew with each town added.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'lock',
            title: '20-minute rebuild lock',
            host: 'Neon Postgres',
            source: 'lib/stats-cache.ts → STATS_CACHE_REBUILD_LOCK_KEY',
            detail:
              'Cross-host lock with a heartbeat, so two hosts cannot rebuild at once and a frozen Lambda cannot hold it forever. Admin "Sync now" and the sweep both steal a stale lock. The queue makes double-rebuilds unlikely rather than impossible — a Netlify rescue and a returning runner can still overlap, which is what this lock is for.',
            status: 'guard',
            statusLabel: 'Guard',
          },
        ],
      },
      {
        id: 'report',
        title: '4 · What the operator sees',
        subtitle: 'Every rebuild leaves a durable record',
        stages: [
          {
            id: 'consume',
            title: 'Marks are consumed, not cleared blindly',
            host: 'Neon Postgres',
            source: 'lib/stats-dirty-towns.ts → clearStatsTownsDirty',
            detail:
              'Only marks stamped at or before the rebuild start are deleted. A write that lands while the rebuild is reading stays dirty, so the next sweep picks it up instead of silently dropping it.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'last-run',
            title: 'Stats cache row shows towns, reason, and size',
            host: 'Admin → Syncs',
            source: 'lib/stats-dirty-towns.ts → formatStatsCacheLastRun',
            detail:
              'stats_cache_last_run records which towns rebuilt, why each qualified, the trigger, entries written, duration, and any error. The Status cell shows that line plus what is still queued.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'history',
            title: 'Done|Failed/stats row in Sync History',
            host: 'Neon Postgres',
            source: 'lib/db/listings-repo.ts → recordDashboardSyncAudit',
            detail:
              'Unchanged: every rebuild still writes a durable history row, now including the town scope and trigger in its detail line.',
            status: 'live',
            statusLabel: 'Live',
          },
          {
            id: 'queue-row',
            title: 'Queue column on Syncs → Dashboard',
            host: 'Admin → Syncs',
            source: 'lib/sync-queue.ts → readSyncQueueSnapshot',
            detail:
              'The sync_queue row itself: waiting with its position and who asked, running with the minutes left on its budget, or the terminal outcome — done, failed, timeout, crashed, cancelled. This is the thing the old in-memory pending slot could never show, and it is why a rebuild that was asked for is no longer indistinguishable from one that was dropped.',
            status: 'live',
            statusLabel: 'Live',
          },
        ],
      },
    ],
  }
}
