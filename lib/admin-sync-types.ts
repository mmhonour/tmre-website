export const ADMIN_SYNC_ACTIONS = {
  'full-resync': {
    label: 'Full resync',
    description: 'Complete MLS → SQLite reload for all towns',
  },
  incremental: {
    label: 'Incremental update',
    description: 'Modified-since RETS pull across all towns',
  },
  'listing-scores': {
    label: 'Goldilocks score rebuild',
    description: 'Re-score every Active listing',
  },
  'publish-snapshot': {
    label: 'Publish read snapshot',
    description: 'Copy listings.db → listings.read.db',
  },
  'stats-cache': {
    label: 'Stats cache rebuild',
    description: 'Recompute market stats, sales-by-month, vintage, and price caches',
  },
  'deal-of-the-day': {
    label: 'Deal of the Day cache',
    description:
      'Recompute Deal of the Day picks (7 towns × sale/rental × homes/multi/condos)',
  },
  'property-addresses': {
    label: 'Property address directory',
    description: 'MLS + Vision assessor verify for List With Me autocomplete',
  },
  'zip-boundaries': {
    label: 'Zip boundary maps',
    description: 'Census TIGERweb ZCTA rings → Postgres for Intelligence / Latest maps',
  },
  'fomc-sync': {
    label: 'FOMC statement sync',
    description:
      'Scrape official FOMC statement on decision day (~3:15 p.m. ET) into Postgres for /fed-analysis',
  },
  'cpi-sync': {
    label: 'CPI release sync',
    description:
      'Scrape official BLS CPI news release on print day (~9:15 a.m. ET) into Postgres for /fed-analysis',
  },
  'market-digest': {
    label: 'Monday market brief',
    description:
      'Weekly Resend months-supply / inventory digest email (Mon ~8am ET) for /market-pulse',
  },
} as const

export type AdminSyncActionId = keyof typeof ADMIN_SYNC_ACTIONS

export function isAdminSyncActionId(value: string): value is AdminSyncActionId {
  return value in ADMIN_SYNC_ACTIONS
}

/**
 * Fallback Sync all order when Configure schedule has not loaded yet.
 * Prefer syncAllClientStepsFromConfig(readSyncScheduleConfig()) at runtime.
 * Incremental is included — Order # / Sync All priority is Admin-configurable.
 */
export const ADMIN_SYNC_ALL_SEQUENCE = [
  'full-resync',
  'incremental',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
  'property-addresses',
  'zip-boundaries',
  // fomc-sync / cpi-sync / market-digest omitted — event/email jobs
] as const satisfies readonly AdminSyncActionId[]

/** Client-side Sync all fallback — one POST per step to stay under serverless timeouts. */
export const ADMIN_SYNC_ALL_CLIENT_STEPS = [
  ...ADMIN_SYNC_ALL_SEQUENCE,
  'publish-snapshot',
] as const satisfies readonly AdminSyncActionId[]

/**
 * Fallback Order # when Configure schedule has not loaded.
 * Runtime UI uses scheduleConfig.order from sync_meta.
 */
export const ADMIN_MANUAL_SYNC_ORDER_BY_ROW: Partial<Record<string, number>> = {
  'full-resync': 1,
  incremental: 2,
  'listing-scores': 3,
  'stats-cache': 4,
  'deal-of-the-day': 5,
  'property-addresses': 6,
  'zip-boundaries': 7,
  'fomc-sync': 8,
  'cpi-sync': 9,
  'market-digest': 10,
}

/** Skipped when full resync is queued on a Netlify background function (already chained). */
export const ADMIN_SYNC_STEPS_AFTER_BACKGROUND_FULL = new Set<AdminSyncActionId>([
  'incremental',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
  'publish-snapshot',
])

/**
 * Ordered finalize steps for a chunked full resync — mirrors the per-town chunking pattern
 * so each step comfortably completes within a single serverless invocation. The "persist" step
 * also runs the final bookkeeping (deploy-complete marker, blob persist, progress clear, refresh
 * lock release, deferred photo warm) that used to run in `finalizeChunkedFullResync()`'s finally.
 */
export const FULL_RESYNC_FINALIZE_STEPS = [
  'scores',
  'superlatives',
  'stats-cache',
  'deal-of-day',
  'deal-of-week',
  'spotlight',
  'if-estimates',
  'edge-scores',
  'persist',
] as const satisfies readonly string[]

export type FullResyncFinalizeStepId = (typeof FULL_RESYNC_FINALIZE_STEPS)[number]

export function isFullResyncFinalizeStepId(value: string): value is FullResyncFinalizeStepId {
  return (FULL_RESYNC_FINALIZE_STEPS as readonly string[]).includes(value)
}

/** Human labels for admin progress messaging while a finalize step is running/complete. */
export const FULL_RESYNC_FINALIZE_STEP_LABELS: Record<FullResyncFinalizeStepId, string> = {
  scores: 'Goldilocks scores',
  superlatives: 'listing superlatives',
  'stats-cache': 'stats cache',
  'deal-of-day': 'Deal of the Day cache',
  'deal-of-week': 'Deal of the Week cache',
  spotlight: 'spotlight caches',
  'if-estimates': 'IF value estimates',
  'edge-scores': 'edge scores',
  persist: 'read snapshot + persisting to storage',
}

export type AdminSyncAllActionId = 'sync-all-caches'

export function isAdminSyncAllActionId(value: string): value is AdminSyncAllActionId {
  return value === 'sync-all-caches'
}

export type AdminTableWriteStats = {
  table: string
  queried: number
  inserted: number
  updated: number
  deleted?: number
}

export type AdminSyncTableStatsReport = {
  finishedAt: string
  tables: AdminTableWriteStats[]
}

export type AdminDatabaseSyncId = 'listings' | 'listings.read'

export type AdminDatabaseTableStat = {
  table: string
  rowCount: number
  /** True when COUNT(*) was skipped (e.g. listing_photos uses MAX(rowid)). */
  approximate?: boolean
}

export type AdminDatabaseSyncStats = {
  id: AdminDatabaseSyncId
  label: string
  path: string
  exists: boolean
  sizeBytes: number | null
  available: boolean
  error?: string
  tables: AdminDatabaseTableStat[]
  summary: string
}
