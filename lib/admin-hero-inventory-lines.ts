/** Neon table of R2 photo metadata — one row per stored slot. */
export const LISTING_PHOTO_INDEX_TABLE = 'listing_photo_index'

export function formatAdminListingsInPostgresLine(total: number): string {
  return `${total.toLocaleString()} listings in Postgres`
}

export function formatAdminIndexedR2PhotosLine(photoCount: number): string {
  return `${photoCount.toLocaleString()} photos referenced in Postgres ${LISTING_PHOTO_INDEX_TABLE} in R2`
}
