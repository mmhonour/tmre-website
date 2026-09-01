import type { RawRetsRecord } from '@/lib/rets'
import { normalizeMlsDate, normalizeMlsTimestamp } from '@/lib/mls-time'

/**
 * Every date the MLS feed actually publishes, for the Admin view of a listing.
 *
 * The agent-facing dates the SmartMLS web UI shows are deliberately absent here
 * because they are absent from the feed: of 299 Property fields only 13 are
 * dates, and Contract Effective Date, Expiration Date, Deposit Date, Purchase
 * Contract Date and Proposed Closing Date are none of them. A listing agent can
 * read those in the MLS itself, but no amount of mapping will find them in
 * `raw` — they never cross the IDX boundary. Don't go looking again.
 */
export type ListingMlsDate = {
  /** RETS SystemName, kept so a value on screen can be traced to the feed. */
  field: string
  label: string
  /** Normalized: explicit offset for calendar days, UTC for record stamps. */
  iso: string
  /** False for calendar-day fields, which carry no clock to show. */
  hasTime: boolean
}

/**
 * Listing lifecycle first, then the record-keeping stamps. `CloseDate` is the
 * physical closing; `StatusChangeTimestamp` is when the MLS was told about it,
 * and those are routinely weeks apart on a back-dated closing.
 */
const MLS_DATE_FIELDS: readonly {
  field: string
  label: string
  hasTime: boolean
}[] = [
  { field: 'OriginalEntryTimestamp', label: 'Entered in MLS', hasTime: true },
  { field: 'ListingContractDate', label: 'Listing contract date', hasTime: false },
  { field: 'ExpectedActiveDate', label: 'Expected active', hasTime: false },
  { field: 'ComingSoonToActiveDate', label: 'Coming soon to active', hasTime: false },
  { field: 'OffMarketDate', label: 'Off market', hasTime: false },
  { field: 'CloseDate', label: 'Closed', hasTime: false },
  { field: 'StatusChangeTimestamp', label: 'Status last changed', hasTime: true },
  { field: 'PriceChangeTimestamp', label: 'Price last changed', hasTime: true },
  { field: 'ModificationTimestamp', label: 'Listing last updated', hasTime: true },
  { field: 'PhotoModificationTimestamp', label: 'Photos last updated', hasTime: true },
  { field: 'UpdateDate', label: 'Feed update date', hasTime: false },
]

/** Published dates present on this record, in lifecycle order. Absent fields are skipped. */
export function listingMlsDates(
  raw: RawRetsRecord | null | undefined,
): ListingMlsDate[] {
  if (!raw) return []
  const record = raw as Record<string, unknown>
  const out: ListingMlsDate[] = []
  for (const spec of MLS_DATE_FIELDS) {
    const value = record[spec.field]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const iso = spec.hasTime
      ? normalizeMlsTimestamp(trimmed)
      : normalizeMlsDate(trimmed)
    if (!iso) continue
    out.push({
      field: spec.field,
      label: spec.label,
      iso,
      hasTime: spec.hasTime,
    })
  }
  return out
}
