export type AlertJobKind = 'listing' | 'open_house'
export type AlertJobSource = 'incremental' | 'open-houses' | 'admin'

/** stats_cache keys — survive the hourly market-stats rebuild. */
export const ALERT_JOB_LAST_RUN_KEYS = {
  listing: 'alerts:listing:last-run',
  open_house: 'alerts:open-house:last-run',
} as const

export type AlertJobLastRun = {
  at: string
  kind: AlertJobKind
  source: AlertJobSource
  ok: boolean
  checked: number
  sent: number
  listings: number
  error?: string
}

export type AlertJobLastRuns = {
  listing: AlertJobLastRun | null
  openHouse: AlertJobLastRun | null
}

export type SavedSearchAlertProcessResult = {
  kind: AlertJobKind
  source: AlertJobSource
  checked: number
  sent: number
  listings: number
  ok: boolean
  error?: string
}

export function alertJobKindLabel(kind: AlertJobKind): string {
  return kind === 'listing' ? 'Listing alerts' : 'Open-house alerts'
}

export function alertJobSourceLabel(source: AlertJobSource): string {
  if (source === 'incremental') return 'Incremental (Railway)'
  if (source === 'open-houses') return 'Open houses (Railway)'
  return 'Admin Process now'
}
