export type AdminSyncPanelRowId =
  | 'full-resync'
  | 'incremental'
  | 'latest-mls'
  | 'listing-scores'
  | 'edge-scores'
  | 'refresh-finished'
  | 'stats-cache'
  | 'deal-of-the-day'
  | 'property-addresses'
  | 'vision-addresses'
  | 'zip-boundaries'
  | 'fomc-sync'
  | 'cpi-sync'
  | 'market-digest'

/** Wall clocks on Admin Sync (Start / End / Next / schedules). */
export const ADMIN_SYNC_TZ = 'America/New_York'

/**
 * How long a slot may sit unclaimed before Admin calls it overdue.
 *
 * Slots are claimed by sweeps, not at the instant they open: the Railway stats
 * sweep ticks every 10m and Goldilocks every 5m, each gated on its Configure
 * slot. Without this window the row turns red for the minutes between the slot
 * opening and the next tick, on a job behaving exactly as designed.
 */
export const ADMIN_SYNC_SLOT_CLAIM_GRACE_MS = 15 * 60 * 1000

/** Order column label — 3a/3b keep Goldilocks + Edge as one conceptual step pair. */
export function adminSyncOrderDisplay(
  rowId: string,
  orderNumber: number | null | undefined,
): string | null {
  if (orderNumber == null) return null
  if (rowId === 'listing-scores') return '3a'
  if (rowId === 'edge-scores') return '3b'
  return String(orderNumber)
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Full timestamp for tooltips / status lines: `Mar 12, 2026, 10:47 AM ET`. */
export function formatAdminSyncTimestamp(iso: string | null | undefined): string {
  const date = parseIsoDate(iso)
  if (!date) return '—'
  const clock = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ADMIN_SYNC_TZ,
  }).format(date)
  return `${clock} ET`
}

/** Compact clock for Start / End / Next cells: `10:47 AM ET`. */
export function formatAdminSyncTimeOnly(iso: string | null | undefined): string {
  const date = parseIsoDate(iso)
  if (!date) return '—'
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ADMIN_SYNC_TZ,
  }).format(date)
  return `${clock} ET`
}

/** Short calendar date in Eastern: `Mar 12, 2026`. */
export function formatAdminSyncDateShort(iso: string | null | undefined): string {
  const date = parseIsoDate(iso)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: ADMIN_SYNC_TZ,
  }).format(date)
}

/** `YYYY-MM-DD` in America/New_York — for same-day comparisons on the dashboard. */
export function adminSyncCalendarDate(iso: string | null | undefined): string | null {
  const date = parseIsoDate(iso)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_SYNC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

/** Format next sync time; includes weekday + date when more than 24h away. Always Eastern. */
export function formatAdminNextSyncAt(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—'
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return '—'

  const msUntil = target.getTime() - now.getTime()
  if (msUntil <= 0) return 'Due now'

  const includeDay = msUntil > 24 * 60 * 60 * 1000
  if (includeDay) {
    const clock = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: ADMIN_SYNC_TZ,
    }).format(target)
    return `${clock} ET`
  }

  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ADMIN_SYNC_TZ,
  }).format(target)
  return `${clock} ET`
}

/** Live countdown for near-term schedules (post-deploy warm, incremental). */
export function formatAdminNextSyncCountdown(
  iso: string | null | undefined,
  now = new Date(),
): string {
  if (!iso) return '—'
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return '—'

  const msUntil = target.getTime() - now.getTime()
  if (msUntil <= 0) return 'Due now'

  const totalSec = Math.ceil(msUntil / 1000)
  if (totalSec < 60) return `${totalSec}s`

  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (msUntil < 60 * 60_000) {
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`
  }

  return formatAdminNextSyncAt(iso, now)
}
