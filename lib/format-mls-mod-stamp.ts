import { mlsTimestampMs } from '@/lib/mls-time'

/**
 * Compact MLS ModificationTimestamp for listing/Spotlight property facts.
 * Advertising/legal freshness clock — not the /latest event clock.
 */
export function formatMlsModificationStamp(
  iso: string | null | undefined,
): string | null {
  const ms = mlsTimestampMs(iso)
  if (Number.isNaN(ms)) return null
  const date = new Date(ms)
  const label = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
  return `Last modified ${label}`
}
