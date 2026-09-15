/**
 * Catch-up vs weekly fill for street-house Field Cards.
 *
 * Catch-up (Railway 10-minute sweep / thin cron bypass of Configure):
 * only parcels that have never been ingested. A stored card without a
 * mailing line must not keep the job due every ten minutes — VGSI often
 * has no Owner address, so re-fetching the same 40 PIDs never completes.
 *
 * Weekly fill still retries empty owner_name after a week, in case a later
 * Field Card print grows a name. Mailing-only gaps wait for the letter walk.
 */

export const VISION_OWNER_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/** SQL fragment: no vision_addresses row for this street-house PID. */
export const VISION_STREET_OWNER_CATCHUP_SQL = `v.vision_pid IS NULL`

/**
 * SQL fragment: never ingested, or owner_name still blank after the retry
 * window. Does not include mailing-only gaps.
 */
export const VISION_STREET_OWNER_FILL_SQL = `(
          v.vision_pid IS NULL
          OR (
            (v.owner_name IS NULL OR btrim(v.owner_name) = '')
            AND (
              v.scraped_at IS NULL
              OR v.scraped_at < now() - interval '7 days'
            )
          )
        )`

export function visionStreetPidNeedsOwnerCatchUp(
  hasVisionAddress: boolean,
): boolean {
  return !hasVisionAddress
}

export function visionStreetPidNeedsOwnerFill(row: {
  hasVisionAddress: boolean
  ownerName: string | null | undefined
  scrapedAt: Date | string | null | undefined
  now?: Date
}): boolean {
  if (!row.hasVisionAddress) return true
  if (row.ownerName?.trim()) return false
  if (!row.scrapedAt) return true
  const scraped =
    row.scrapedAt instanceof Date ? row.scrapedAt : new Date(row.scrapedAt)
  const scrapedMs = scraped.getTime()
  if (!Number.isFinite(scrapedMs)) return true
  const now = row.now ?? new Date()
  return now.getTime() - scrapedMs >= VISION_OWNER_RETRY_AFTER_MS
}
