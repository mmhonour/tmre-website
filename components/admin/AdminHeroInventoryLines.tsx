import {
  formatAdminIndexedR2PhotosLine,
  formatAdminListingsInPostgresLine,
} from '@/lib/admin-hero-inventory-lines'

export type AdminHeroInventoryLinesProps = {
  listings: number
  /** Null when the index count could not be read. */
  photos: number | null
  refreshing?: boolean
  listingsEmpty?: boolean
}

export default function AdminHeroInventoryLines({
  listings,
  photos,
  refreshing = false,
  listingsEmpty = false,
}: AdminHeroInventoryLinesProps) {
  const listingsLine = refreshing
    ? 'Refresh in progress'
    : listingsEmpty
      ? '⚠ 0 listings — run Incremental'
      : formatAdminListingsInPostgresLine(listings)
  return (
    <span className="flex items-start gap-2">
      <span
        className={`mt-1 w-1.5 h-1.5 shrink-0 rounded-full ${
          refreshing
            ? 'bg-gold animate-pulse-dot'
            : listingsEmpty
              ? 'bg-coral animate-pulse-dot'
              : 'bg-sage'
        }`}
      />
      <span
        className={
          listingsEmpty ? 'text-coral font-semibold' : 'text-white/50'
        }
      >
        <span className="block">{listingsLine}</span>
        {photos != null && !refreshing ? (
          <span className="mt-1 block">{formatAdminIndexedR2PhotosLine(photos)}</span>
        ) : null}
      </span>
    </span>
  )
}
