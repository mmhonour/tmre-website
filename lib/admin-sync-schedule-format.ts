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
  | 'zip-boundaries'
  | 'fomc-sync'
  | 'cpi-sync'
  | 'market-digest'

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

/** Format next sync time; includes weekday + date when more than 24h away. */
export function formatAdminNextSyncAt(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—'
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return '—'

  const msUntil = target.getTime() - now.getTime()
  if (msUntil <= 0) return 'Due now'

  const includeDay = msUntil > 24 * 60 * 60 * 1000
  if (includeDay) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(target)
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(target)
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
