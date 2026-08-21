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
    title: 'Incremental update — Railway pull · Neon handoff · Netlify warm',
    subtitle:
      'Preferred path: Railway mls-sync pulls RETS into Neon (Lane 1), Neon End/heartbeat is inventory truth (Lane 2), Netlify warms boards/feeds/stats and digests (Lane 3). Netlify cron / EventBridge remain legacy fallbacks.',
    ownership: [
      {
        id: 'lane-1',
        title: 'Lane 1 — RETS pull',
        host: 'Railway mls-sync',
        owns: 'Open RETS → modified-since pull (7 towns) → upsert listings → stamp End + last_mls_sync_heartbeat → logout (auto). Admin Sync now / watchdog POST /run stay lean via MLS_SYNC_SERVICE=1.',
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
          'Primary Incremental RETS pull when Scheduler is Railway. Thin cron / EventBridge / Netlify worker RETS paths are legacy or fallback only.',
      },
    ],
    clocks: [
      {
        id: 'railway-heartbeat',
        label: 'Railway heartbeat',
        metaKey: 'last_mls_sync_heartbeat',
        meaning:
          'mls-sync process stamped Neon (~60s idle pulse + each run). Peace-of-mind that Railway is alive — not the same as End advancing with upserts. Admin pink BROKEN only when this clock is dead (~45m).',
      },
      {
        id: 'cron-tick',
        label: 'Cron last fired',
        metaKey: 'last_incremental_cron_tick',
        meaning:
          'Thin */30 schedule woke up (heartbeat). Legacy when Scheduler is Railway — does not mean RETS finished. Hidden on Dashboard when Scheduler is EventBridge.',
      },
      {
        id: 'eventbridge-ingress',
        label: 'EventBridge last fired',
        metaKey: 'last_eventbridge_ingress_at_incremental',
        meaning:
          'HTTP hit to eventbridge-sync-ingress for Incremental (legacy optional alarm). Prefer Railway service for Incremental.',
      },
      {
        id: 'start',
        label: 'Start',
        metaKey: 'last_incremental_sync_started',
        meaning:
          'When a pull last began (Railway /run or queued worker). Can advance before town upserts finish.',
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
          'Last finished RETS→Neon write — must move on the Railway interval (~30m). Trust this for inventory freshness. /latest Last pull uses this key only.',
      },
    ],
    nodes: [
      {
        id: 'you',
        lane: 'admin',
        title: 'You (Admin Dashboard)',
        detail:
          'Read Start / End / Status / Railway heartbeat / Scheduler. Pink BROKEN = heartbeat dead (~45m). STALE = process up, End not moving. Sync now doorbell failures (host-only URL) stay in Errors and do not paint the row when heartbeat is live.',
      },
      {
        id: 'configure',
        lane: 'admin',
        title: 'Configure',
        detail:
          'Scheduler radio: Railway service (preferred) | Netlify cron | EventBridge. Pause / Next / frequency apply to Netlify/EB paths; Railway is its own clock (interval + /run).',
      },
      {
        id: 'railway',
        lane: 'railway',
        title: 'Railway mls-sync (Lane 1)',
        detail:
          'Always-on Node (services/mls-sync). Sets MLS_SYNC_SERVICE=1 → runIncrementalSyncListingsWork with postHooks:false. Interval (~30m) + POST /run. Idle heartbeat ~60s so Admin can tell process-up from pull-stale. Env: DATABASE_URL, RETS_*, SYNC_CRON_SECRET, NEXT_PUBLIC_SITE_URL (warm handoff).',
      },
      {
        id: 'handoff',
        lane: 'railway',
        title: 'Warm handoff',
        detail:
          'After Neon upserts: queue Netlify sync-listings-worker with sideWorkOnly + source=railway. Non-fatal — look for warm-handoff in the step log. Needs NEXT_PUBLIC_SITE_URL + SYNC_CRON_SECRET on Railway.',
      },
      {
        id: 'thin-cron',
        lane: 'cron',
        title: 'sync-listings (*/30) — legacy',
        detail:
          '≤30s Netlify path when Scheduler is still Netlify. Stamp Cron last fired → queue worker. Skips Incremental work when Scheduler is Railway/EventBridge (after heartbeat where applicable).',
      },
      {
        id: 'eventbridge',
        lane: 'cron',
        title: 'AWS EventBridge — legacy optional',
        detail:
          'Optional alarm → eventbridge-sync-ingress → queue worker. Prefer flipping Configure → Railway instead of dual-firing with mls-sync.',
      },
      {
        id: 'watchdog',
        lane: 'cron',
        title: 'sync-listings-watchdog (*/15)',
        detail:
          'If End older than ~70m and Scheduler is Netlify: re-queue worker. When Scheduler is Railway, heal via mls-sync /run or Admin Sync now — not this Netlify watchdog.',
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
        title: 'sync-listings-worker full RETS — legacy',
        detail:
          'Netlify background with postHooks:true when Scheduler is still Netlify/EventBridge. Not the preferred Incremental path once Railway owns the pull.',
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
      { from: 'you', to: 'railway', label: 'Sync now → POST /run (admin)' },
      { from: 'configure', to: 'railway', label: 'Scheduler = Railway' },
      { from: 'configure', to: 'thin-cron', label: 'Scheduler = Netlify (legacy)' },
      { from: 'configure', to: 'eventbridge', label: 'Scheduler = EventBridge (legacy)' },
      { from: 'railway', to: 'neon', label: 'Lane 1: RETS → upsert → End + heartbeat' },
      { from: 'railway', to: 'handoff', label: 'postHooks skip' },
      { from: 'handoff', to: 'worker-warm', label: 'Lane 3: sideWorkOnly queue' },
      { from: 'worker-warm', to: 'neon', label: 'stats_cache / digests write' },
      { from: 'thin-cron', to: 'worker-rets', label: 'HTTP 202 queue (legacy)' },
      { from: 'eventbridge', to: 'worker-rets', label: 'ingress → queue (legacy)' },
      { from: 'watchdog', to: 'worker-rets', label: 're-queue if End stale (Netlify only)' },
      { from: 'worker-rets', to: 'neon', label: 'RETS + postHooks (legacy)' },
      { from: 'neon', to: 'latest', label: 'Lane 2→public: feed / board read' },
    ],
    notes: [
      'Admin Incremental pink = process dead (Railway heartbeat ~45m) or End-broken on legacy Netlify/EB. STALE = process up, End not moving. Overdue Next is never row color. Evaluator: lib/incremental-sync-health.ts.',
      '202 Accepted / warm-handoff failed ≠ inventory loss. Trust End + listings rows; boards rebuild on stale read if the hop fails.',
      'Prefer Configure → Incremental → Railway. Avoid dual-fire with Netlify cron or EventBridge while mls-sync is the clock.',
      'Railway now pulls on the Configure slot (Frequency + Start time as a wall-clock grid) and honours Pause and the scheduler radio: a deploy no longer re-phases the schedule. Backstop — if the schedule read fails, a pull still runs once End is older than 2× the interval.',
      'People / PTA migrations on main are inert until db:migrate runs against Neon — Netlify does not auto-migrate on deploy.',
    ],
  }
}
