/**
 * Hand-maintained Incremental architecture for Admin → Syncs → Dashboard.
 * Keep in sync with netlify/functions/sync-listings*.ts, incremental-sync-watchdog.ts,
 * eventbridge-sync-ingress.ts, and the Dashboard clocks (Start / End / Status / Cron last fired).
 */

export type IncrementalArchNode = {
  id: string
  title: string
  detail: string
  /** Visual lane for the diagram. */
  lane: 'admin' | 'cron' | 'worker' | 'data' | 'public'
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

export function describeIncrementalSyncArchitecture(): {
  title: string
  subtitle: string
  clocks: IncrementalArchClock[]
  nodes: IncrementalArchNode[]
  edges: IncrementalArchEdge[]
  notes: string[]
} {
  return {
    title: 'Incremental update — cron vs Admin vs EventBridge',
    subtitle:
      'How Netlify schedules and (optionally) AWS EventBridge pull MLS, what the Dashboard clocks mean, and what Sync now does.',
    clocks: [
      {
        id: 'cron-tick',
        label: 'Cron last fired',
        metaKey: 'last_incremental_cron_tick',
        meaning:
          'Thin */30 schedule woke up (heartbeat). Does not mean RETS finished or End moved. Still stamps when Scheduler is EventBridge (skip after heartbeat). Hidden on Dashboard when Scheduler is EventBridge — see EventBridge last fired instead.',
      },
      {
        id: 'eventbridge-ingress',
        label: 'EventBridge last fired',
        metaKey: 'last_eventbridge_ingress_at_incremental',
        meaning:
          'HTTP hit to eventbridge-sync-ingress for Incremental (AWS schedule, Send events, or API destination). Stamps even on skip / 401. Companion result line: last_eventbridge_ingress_result_incremental (queued / skipped: … / unauthorized · HTTP n).',
      },
      {
        id: 'start',
        label: 'Start',
        metaKey: 'last_incremental_sync_started',
        meaning:
          'When a worker was last queued (or Sync now pressed). Can advance on a 202 ack even if town pulls never start.',
      },
      {
        id: 'status-live',
        label: 'Status (live)',
        metaKey: 'incremental_sync_live',
        meaning:
          'Queued… / Fetching {town}… / post-hooks. Cleared when RETS finishes, or when Queued is dead (~8m) / End is stale.',
      },
      {
        id: 'end',
        label: 'End / Last pull',
        metaKey: 'last_incremental_sync',
        meaning:
          'Last finished RETS pull — must move ~every 30m. Never cleared at queue/start (only overwritten on finish). Null/stale End = broken Incremental; AWS “last fired” alone is not success. /latest Last pull uses this key only (no Jul full-sync fallback).',
      },
    ],
    nodes: [
      {
        id: 'you',
        lane: 'admin',
        title: 'You (Admin Dashboard)',
        detail:
          'Read Start / End / Status / Scheduler. Sync now queues the same background worker (source=admin) and bypasses pause / Next-defer / frequency / provider gates.',
      },
      {
        id: 'configure',
        lane: 'admin',
        title: 'Configure',
        detail:
          'Pause, Scheduler radio (Netlify cron | EventBridge), frequency, Start time (ET), Next override. Only the chosen alarm may start the job.',
      },
      {
        id: 'thin-cron',
        lane: 'cron',
        title: 'sync-listings (*/30)',
        detail:
          '≤30s. Stamp Cron last fired → skip if Scheduler=EventBridge → due gates → POST sync-listings-worker. On 202: stamp Start + Status Queued.',
      },
      {
        id: 'eventbridge',
        lane: 'cron',
        title: 'AWS EventBridge Scheduler',
        detail:
          'Optional alarm (us-east-1). HTTP POST eventbridge-sync-ingress with Bearer SYNC_CRON_SECRET + { "job": "incremental" }. Runs only when Configure Scheduler is EventBridge.',
      },
      {
        id: 'ingress',
        lane: 'cron',
        title: 'eventbridge-sync-ingress',
        detail:
          'Auth → provider/pause/Next gates → queue sync-listings-worker (source=eventbridge). No Frequency re-check — EventBridge is the clock.',
      },
      {
        id: 'watchdog',
        lane: 'cron',
        title: 'sync-listings-watchdog (*/15)',
        detail:
          'If End older than ~70m and not paused and Scheduler is still Netlify: clear dead Queued, re-queue worker (source=watchdog). Skips when EventBridge owns Incremental.',
      },
      {
        id: 'worker',
        lane: 'worker',
        title: 'sync-listings-worker (background)',
        detail:
          '≤~15m. Auth with SYNC_CRON_SECRET → syncIncrementalListings (7 towns modified-since) → digests / board / stats warm. Clears live Status in finally.',
      },
      {
        id: 'lean',
        lane: 'worker',
        title: 'Lean fallback (in thin cron)',
        detail:
          'RETS without heavy post-hooks when the HTTP queue hop fails or a dead Queued hop is detected — keeps End moving (Netlify path).',
      },
      {
        id: 'neon',
        lane: 'data',
        title: 'Neon Postgres',
        detail:
          'listings upserts + sync_meta clocks (incl. sync_schedule_config.scheduler) + sync_runs history. Survives deploys.',
      },
      {
        id: 'latest',
        lane: 'public',
        title: '/latest (30 on 30)',
        detail:
          'Reads Postgres / warm feed cache — never calls RETS on page view. Fresh only after End advances and caches rebuild.',
      },
    ],
    edges: [
      { from: 'you', to: 'worker', label: 'Sync now → queue (admin)' },
      { from: 'configure', to: 'thin-cron', label: 'pause / due / Next / provider' },
      { from: 'configure', to: 'eventbridge', label: 'Scheduler = EventBridge' },
      { from: 'thin-cron', to: 'worker', label: 'HTTP 202 queue (cron)' },
      { from: 'thin-cron', to: 'lean', label: 'queue fail or dead Queued' },
      { from: 'eventbridge', to: 'ingress', label: 'HTTPS + secret' },
      { from: 'ingress', to: 'worker', label: 'queue (eventbridge)' },
      { from: 'watchdog', to: 'worker', label: 're-queue if End stale (Netlify only)' },
      { from: 'worker', to: 'neon', label: 'RETS → upsert → End' },
      { from: 'lean', to: 'neon', label: 'RETS lean → End' },
      { from: 'neon', to: 'latest', label: 'feed warm / page read' },
    ],
    notes: [
      '202 Accepted ≠ RETS ran. Status can say Queued… while End stays on the prior finished pull.',
      'Cron last fired can look healthy every 30m even when End is hours old — trust End for inventory freshness.',
      'When Scheduler is EventBridge, Netlify thin cron and watchdog must not also queue Incremental (no dual-fire). Flip radio back to Netlify to fall back.',
      'Netlify is serverless: redeploy ships code; it does not clear sync_meta. Use Sync now or wait for watchdog/cron/EventBridge heal.',
    ],
  }
}
