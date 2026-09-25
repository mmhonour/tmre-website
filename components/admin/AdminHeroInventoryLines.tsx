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
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 shrink-0 rounded-full ${
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
          {listingsLine}
        </span>
      </span>
      {photos != null && !refreshing ? (
        <span className="pl-3.5 text-white/50">
          {formatAdminIndexedR2PhotosLine(photos)}
        </span>
      ) : null}
    </span>
  )
}
