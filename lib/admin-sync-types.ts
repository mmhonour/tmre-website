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
    description: 'Recompute Deal of the Day picks for all towns',
  },
  'property-addresses': {
    label: 'Property address directory',
    description: 'MLS + Vision assessor verify for List With Me autocomplete',
  },
} as const

export type AdminSyncActionId = keyof typeof ADMIN_SYNC_ACTIONS

export function isAdminSyncActionId(value: string): value is AdminSyncActionId {
  return value in ADMIN_SYNC_ACTIONS
}

/** Serial order for Admin “Sync all” (MLS full reload → derived caches → read snapshot). */
export const ADMIN_SYNC_ALL_SEQUENCE = [
  'full-resync',
  'listing-scores',
  'stats-cache',
  'deal-of-the-day',
] as const satisfies readonly AdminSyncActionId[]

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
