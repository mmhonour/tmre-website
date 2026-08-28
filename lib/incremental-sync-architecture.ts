/**
 * Hand-maintained Incremental architecture for Admin → Syncs → Dashboard.
 * Keep in sync with services/mls-sync/server.ts, lib/netlify-sync-listings-work.ts,
 * netlify/functions/sync-listings*.ts, incremental-sync-watchdog.ts,
 * eventbridge-sync-ingress.ts, and the Dashboard clocks.
 *
 * Ownership (Aug 2026 lean split):
 *   Lane 1 — Railway mls-sync: RETS → Neon only (postHooks:false via MLS_SYNC_SERVICE=1)
 *   Lane 2 — Neon write is the handoff (End / heartbeat); site never needs Railway for truth
 *   Lane 3 — Netlify owns warm (sideWorkOnly after handoff, or stale-read rebuild)
 *
 * Which host pulls is no longer a setting. Everyone who notices a due pull puts
 * a row on `sync_queue`; the runner claims it into a forked child; Netlify only
 * pulls itself when a row proves the runner is gone.
 */

export type IncrementalArchNode = {
  id: string
  title: string
  detail: string
  /** Visual lane for the diagram. */
  lane: 'admin' | 'railway' | 'cron' | 'worker' | 'data' | 'public'
}

export type IncrementalArchEdge = {
  from: string
  to: string
  label: string
}

export type IncrementalArchClock = {
  id: string
  label: string
  metaKey: string
  meaning: string
}

export type IncrementalArchOwnershipLane = {
  id: string
  title: string
  host: string
  owns: string
  doesNot: string
}

export function describeIncrementalSyncArchitecture(): {
  title: string
  subtitle: string
  ownership: IncrementalArchOwnershipLane[]
  clocks: IncrementalArchClock[]
  nodes: IncrementalArchNode[]
  edges: IncrementalArchEdge[]
  notes: string[]
} {
  return {
    title: 'Incremental update — queue claim · Neon handoff · Netlify warm',
    subtitle:
      'A due pull becomes a sync_queue row. The Railway runner claims it and pulls RETS into Neon in a forked child (Lane 1), Neon End/heartbeat is inventory truth (Lane 2), Netlify warms boards/feeds/stats and digests (Lane 3) — and rescues the row itself if the runner has stopped claiming.',
    ownership: [
      {
        id: 'lane-1',
        title: 'Lane 1 — RETS pull',
        host: 'Railway mls-sync',
        owns: 'Claim the sync_queue row → fork a child → open RETS → modified-since pull (7 towns) → upsert listings → stamp End + last_mls_sync_heartbeat → logout (auto). The parent holds the child to Configure → Budget and records timeout / crashed if it blows it. Admin Sync now and the watchdog enqueue rather than calling a run endpoint directly.',
        doesNot:
          'Deal board, latest town feeds, hero thumbnails, stats_cache rebuild, spotlight/alerts digests — those Node-OOMed this process when postHooks stayed true.',
      },
      {
        id: 'lane-2',
        title: 'Lane 2 — Neon handoff',
        host: 'Neon Postgres',
        owns: 'listings rows + sync_meta (last_incremental_sync End, last_incremental_sync_started, last_mls_sync_heartbeat). Website and Admin read inventory truth here only — never need Railway up for “what’s on the market.”',
        doesNot:
          'Site-cache warm. A healthy End with a quiet Railway still means Neon is the source of truth until the next pull.',
      },
      {
        id: 'lane-3',
        title: 'Lane 3 — Site warm',
        host: 'Netlify',
        owns: 'After Railway finishes, sideWorkOnly worker (source=railway): latest feeds, intelligence deal board, stats cache, spotlight statuses, saved-search alerts. Also stale-read rebuild if the handoff hop fails.',
        doesNot:
          'The Incremental RETS pull, unless a queued row has sat unclaimed past the rescue grace — then the thin cron runs it in-process rather than let inventory go stale.',
      },
    ],
    clocks: [
      {
        id: 'railway-heartbeat',
        label: 'Runner heartbeat',
        metaKey: 'last_mls_sync_heartbeat',
        meaning:
          'mls-sync process stamped Neon (~60s idle pulse, and it keeps beating while a child works — the parent is idle then, which is the point). Peace-of-mind that the runner is alive, not that End is advancing. Admin pink BROKEN only when this clock is dead (~45m), and the Netlify rescue path reads the same key.',
      },
      {
        id: 'queue-row',
        label: 'Queue row',
        metaKey: 'sync_queue (table, not sync_meta)',
        meaning:
          'What was asked for and by whom: state queued/running, priority (Sync now jumps sweeps), deadline_at, and the terminal outcome — done, failed, timeout (killed over budget), crashed (child died without reporting), cancelled. Admin Dashboard → Queue reads exactly this.',
      },
      {
        id: 'cron-tick',
        label: 'Cron last fired',
        metaKey: 'last_incremental_cron_tick',
        meaning:
          'Thin */30 schedule woke up (heartbeat). It says the enqueuer ran, not that RETS finished.',
      },
      {
        id: 'eventbridge-ingress',
        label: 'EventBridge last fired',
        metaKey: 'last_eventbridge_ingress_at_incremental',
        meaning:
          'HTTP hit to eventbridge-sync-ingress for Incremental. Optional second alarm; it enqueues like everyone else, so running it alongside the crons only means the job is asked for twice and deduplicated once.',
      },
      {
        id: 'start',
        label: 'Start',
        metaKey: 'last_incremental_sync_started',
        meaning:
          'When a pull last began (the forked child, or a rescued Netlify worker). Can advance before town upserts finish.',
      },
      {
        id: 'status-live',
        label: 'Status (live)',
        metaKey: 'incremental_sync_live',
        meaning:
          'Queued… / Fetching {town}… / post-hooks / warm-handoff. Cleared when the run finishes, or when Queued is dead (~8m) / End is stale.',
      },
      {
        id: 'end',
        label: 'End / Last pull',
        metaKey: 'last_incremental_sync',
        meaning:
          'Last finished RETS→Neon write — must move on the Configure cadence (~30m). Trust this for inventory freshness. /latest Last pull uses this key only.',
      },
    ],
    nodes: [
      {
        id: 'you',
        lane: 'admin',
        title: 'You (Admin Dashboard)',
        detail:
          'Read Start / End / Status / runner heartbeat / Queue. Pink BROKEN = heartbeat dead (~45m). STALE = process up, End not moving. Sync now doorbell failures (host-only URL) stay in Errors and do not paint the row when heartbeat is live.',
      },
      {
        id: 'configure',
        lane: 'admin',
        title: 'Configure',
        detail:
          'Pause, Frequency, Start time (ET) and Budget. There is no host radio: Budget is the minutes a run gets before the runner kills its child and records a timeout.',
      },
      {
        id: 'queue',
        lane: 'data',
        title: 'sync_queue (the waiting line)',
        detail:
          'One waiting row and one running row per job, enforced by partial unique indexes, so four enqueuers cannot stack four pulls. Claims take FOR UPDATE SKIP LOCKED. A timeout or crash cools the job down for 30 minutes instead of re-queueing the same fatal work every boot; an operator pressing Sync now skips that cooldown on purpose.',
      },
      {
        id: 'railway',
        lane: 'railway',
        title: 'Railway mls-sync runner (Lane 1)',
        detail:
          'Always-on Node (services/mls-sync). Claims a queue row, forks services/mls-sync/job-child.ts, and holds it to its deadline — SIGTERM, then SIGKILL after 15s. MLS_SYNC_SERVICE=1 → runIncrementalSyncListingsWork with postHooks:false. Idle heartbeat ~60s so Admin can tell process-up from pull-stale. Env: DATABASE_URL, RETS_*, SYNC_CRON_SECRET, NEXT_PUBLIC_SITE_URL (warm handoff), optional MLS_SYNC_CHILD_MAX_OLD_SPACE_MB so an OOM kills the child instead of the service.',
      },
      {
        id: 'handoff',
        lane: 'railway',
        title: 'Warm handoff',
        detail:
          'After Neon upserts: processDueSavedSearchAlerts() on Railway (listing emails must not wait on the hop), then queue Netlify sync-listings-worker with sideWorkOnly + source=railway. Handoff is non-fatal — look for warm-handoff in the step log. Needs NEXT_PUBLIC_SITE_URL + SYNC_CRON_SECRET on Railway.',
      },
      {
        id: 'thin-cron',
        lane: 'cron',
        title: 'sync-listings (*/30) — enqueuer + rescue',
        detail:
          '≤30s Netlify path. Stamp Cron last fired, put a row on sync_queue, and stop. It only runs the pull itself (queue the full RETS worker) when its row has sat unclaimed past the rescue grace and the runner heartbeat is stale — the fallback that used to need someone flipping a radio.',
      },
      {
        id: 'eventbridge',
        lane: 'cron',
        title: 'AWS EventBridge — optional second alarm',
        detail:
          'Optional alarm → eventbridge-sync-ingress → sync_queue. Safe to run beside the Netlify cron: the unique index means a double ask is one waiting row.',
      },
      {
        id: 'watchdog',
        lane: 'cron',
        title: 'sync-listings-watchdog (*/15)',
        detail:
          'If End is older than ~70m: enqueue. A live runner claims it within seconds; only a stale runner heartbeat sends the watchdog down the old Netlify re-queue path.',
      },
      {
        id: 'worker-warm',
        lane: 'worker',
        title: 'sync-listings-worker sideWorkOnly (Lane 3)',
        detail:
          'Netlify background ≤~15m. No RETS. Latest feeds, deal board, stats cache, spotlight + saved-search digests. Queued by Railway handoff (source=railway) or thin-cron lean fallback.',
      },
      {
        id: 'worker-rets',
        lane: 'worker',
        title: 'sync-listings-worker full RETS — rescue only',
        detail:
          'Netlify background with postHooks:true. Reached only when a stranded queue row proves the runner is gone, so stale inventory never waits on a redeploy.',
      },
      {
        id: 'neon',
        lane: 'data',
        title: 'Neon Postgres (Lane 2)',
        detail:
          'listings upserts + sync_meta clocks (End, Start, heartbeat, schedule) + sync_runs. Survives deploys. Inventory truth for the website.',
      },
      {
        id: 'latest',
        lane: 'public',
        title: '/latest · /intelligence',
        detail:
          'Read Neon + warm caches — never call RETS on page view. Boards refresh from Lane 3 warm or stale-read rebuild after End advances.',
      },
    ],
    edges: [
      { from: 'you', to: 'queue', label: 'Sync now → enqueue at manual priority' },
      { from: 'configure', to: 'railway', label: 'Frequency / Start / Budget' },
      { from: 'thin-cron', to: 'queue', label: 'due → enqueue' },
      { from: 'eventbridge', to: 'queue', label: 'ingress → enqueue' },
      { from: 'watchdog', to: 'queue', label: 'End stale → enqueue' },
      { from: 'queue', to: 'railway', label: 'claim (SKIP LOCKED) → fork child' },
      { from: 'railway', to: 'neon', label: 'Lane 1: RETS → upsert → End + heartbeat' },
      { from: 'railway', to: 'queue', label: 'outcome: done / failed / timeout / crashed' },
      { from: 'railway', to: 'handoff', label: 'postHooks skip' },
      { from: 'handoff', to: 'worker-warm', label: 'Lane 3: sideWorkOnly queue' },
      { from: 'worker-warm', to: 'neon', label: 'stats_cache / digests write' },
      { from: 'queue', to: 'worker-rets', label: 'stranded row → Netlify rescue' },
      { from: 'worker-rets', to: 'neon', label: 'RETS + postHooks (rescue)' },
      { from: 'neon', to: 'latest', label: 'Lane 2→public: feed / board read' },
    ],
    notes: [
      'Admin Incremental pink = process dead (runner heartbeat ~45m) or End-broken on a job no runner owns. STALE = process up, End not moving. Overdue Next is never row color. Evaluator: lib/incremental-sync-health.ts.',
      '202 Accepted / warm-handoff failed ≠ inventory loss. Trust End + listings rows; boards rebuild on stale read if the hop fails.',
      'Dual-firing is no longer a hazard: every alarm enqueues, and one waiting row per job is a database constraint rather than a convention.',
      'The runner pulls on the Configure slot (Frequency + Start time as a wall-clock grid) and honours Pause, so a deploy does not re-phase the schedule. Backstop — if the schedule read fails, a pull is still enqueued once End is older than 2× the interval.',
      'A run that outlives Configure → Budget is killed and recorded as timeout, and a child that dies without reporting is recorded as crashed — usually the OOM killer. Both beat a Start with no End.',
      'People / PTA migrations on main are inert until db:migrate runs against Neon — Netlify does not auto-migrate on deploy. That includes 0022_sync_queue.sql, though the app creates the table on demand if the migration has not run.',
    ],
  }
}
