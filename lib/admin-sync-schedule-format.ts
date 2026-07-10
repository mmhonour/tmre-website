export type AdminSyncPanelRowId =
  | 'full-resync'
  | 'incremental'
  | 'latest-mls'
  | 'listing-scores'
  | 'refresh-finished'
  | 'stats-cache'
  | 'deal-of-the-day'
  | 'property-addresses'

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
