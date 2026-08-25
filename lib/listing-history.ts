import type { Listing } from '@/lib/rets'
import { isRentalListing } from '@/lib/listing-kind'
import { isUnderContractStatus } from '@/lib/listing-status'

export type ListingHistoryEvent = {
  date: string | null
  label: string
  detail?: string
  sortMs: number
}

export type PriorListingSummary = {
  mlsId: string
  status: string
  listDate: string | null
  price: number | null
  originalListPrice: number | null
  closeDate: string | null
  closePrice: number | null
  isRental: boolean
}

const STATUS_LABELS: Record<string, string> = {
  A: 'Active',
  P: 'Pending',
  C: 'Closed',
  X: 'Expired',
  W: 'Withdrawn',
  CS: 'Coming Soon',
  H: 'Hold',
  T: 'Temp off market',
  D: 'Under Contract',
}

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pickField(
  r: Record<string, string> | null | undefined,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const v = str(r?.[key])
    if (v) return v
  }
  return null
}

function parseMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

export function formatMlsStatus(status: string | null | undefined): string {
  const raw = str(status)
  if (!raw) return 'Unknown'
  const upper = raw.toUpperCase()
  const code = raw.length === 1 ? upper : null
  if (code && STATUS_LABELS[code]) return STATUS_LABELS[code]
  if (upper === 'SH' || upper === 'UC-CTS' || upper === 'CTS') {
    return 'Under Contract - Continue to Show'
  }
  if (upper === 'UC' || upper === 'AUC') return 'Under Contract'
  if (/^active[\s_-]*under[\s_-]*contract$/i.test(raw)) return 'Under Contract'
  if (/continue\s*to\s*show/i.test(raw)) {
    return 'Under Contract - Continue to Show'
  }
  if (/^active$/i.test(raw)) return 'Active'
  if (/^pending$/i.test(raw)) return 'Pending'
  if (/^closed$/i.test(raw)) return 'Closed'
  if (/^coming soon$/i.test(raw)) return 'Coming Soon'
  return raw
}

/**
 * SmartMLS often keeps MLSStatus=Coming Soon after the listing is live while
 * RESO StandardStatus has already moved to Active (or Pending/Closed). Prefer
 * StandardStatus once it leaves Coming Soon so listing pages match the board.
 */
export function coalesceListingStatus(
  mlsStatus: string | null | undefined,
  standardStatus?: string | null,
): string {
  const mls = str(mlsStatus)
  const standard = str(standardStatus)
  const mlsLabel = formatMlsStatus(mls)
  const standardLabel = formatMlsStatus(standard)
  if (
    mlsLabel === 'Coming Soon' &&
    standard &&
    standardLabel !== 'Coming Soon' &&
    standardLabel !== 'Unknown'
  ) {
    return standardLabel
  }
  // MLSStatus often stays Active after RESO StandardStatus moves to
  // ActiveUnderContract / Pending / Continue to Show.
  if (
    standard &&
    (isUnderContractStatus(standard) ||
      standardLabel === 'Pending' ||
      standardLabel === 'Closed' ||
      standardLabel === 'Expired' ||
      standardLabel === 'Withdrawn')
  ) {
    return standardLabel === 'Unknown' ? standard : standardLabel
  }
  return mls || standard
}

export function fmtMoney(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${n.toLocaleString()}`
}

export function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Normalize street for address matching across MLS records. */
export function normalizeStreetAddress(street: string): string {
  return street
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|COURT|CT|PLACE|PL|BOULEVARD|BLVD|TPKE|TURNPIKE|TRAIL|TRL|WAY|CIRCLE|CIR)\b/g, (m) => {
      const map: Record<string, string> = {
        STREET: 'ST',
        ROAD: 'RD',
        AVENUE: 'AVE',
        LANE: 'LN',
        DRIVE: 'DR',
        COURT: 'CT',
        PLACE: 'PL',
        BOULEVARD: 'BLVD',
        TURNPIKE: 'TPKE',
        TRAIL: 'TRL',
        CIRCLE: 'CIR',
      }
      return map[m] ?? m
    })
}

export function streetsMatch(a: string, b: string): boolean {
  const na = normalizeStreetAddress(a)
  const nb = normalizeStreetAddress(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const numA = na.match(/^(\d+[A-Z]?)/)?.[1]
  const numB = nb.match(/^(\d+[A-Z]?)/)?.[1]
  if (!numA || numA !== numB) return false
  const restA = na.slice(numA.length).trim()
  const restB = nb.slice(numB.length).trim()
  const wordA = restA.split(/[\s,]/)[0]
  const wordB = restB.split(/[\s,]/)[0]
  return Boolean(wordA && wordB && wordA === wordB)
}

export function closeFieldsFromListing(
  listing: Pick<Listing, 'status' | 'price'> & {
    statusChangeTimestamp?: string | null
    raw?: Listing['raw'] | null
  },
): {
  closeDate: string | null
  closePrice: number | null
} {
  const raw =
    listing?.raw && typeof listing.raw === 'object' ? listing.raw : {}
  const isClosed = formatMlsStatus(listing?.status) === 'Closed'
  // Only treat StatusChangeTimestamp as a close date when the listing is
  // actually Closed — for Active/UC rows it is a status flip, not a sale.
  const closeDate =
    pickField(raw, ['CloseDate', 'ClosedDate', 'SettlementDate']) ??
    (isClosed
      ? pickField(raw, ['StatusChangeTimestamp']) ??
        (listing.statusChangeTimestamp?.trim() || null)
      : null)
  return {
    closeDate,
    closePrice:
      num(raw.ClosePrice) ??
      num(raw.SoldPrice) ??
      num(raw.SalePrice) ??
      (isClosed ? listing.price : null),
  }
}

type ListingPriceSource = Pick<Listing, 'status' | 'price'> & {
  statusChangeTimestamp?: string | null
  raw?: Listing['raw'] | null
}

/**
 * Primary money figure for headers / Spotlight / comps display.
 * Closed → final close (same source as History’s Closed entry); otherwise list/ask.
 */
export function primaryListingPrice(listing: ListingPriceSource): number | null {
  if (formatMlsStatus(listing?.status) === 'Closed') {
    const { closePrice } = closeFieldsFromListing(listing)
    if (closePrice != null && closePrice > 0) return closePrice
  }
  return listing.price != null && listing.price > 0 ? listing.price : null
}

/** Whether {@link primaryListingPrice} is a closed sale/lease vs list/ask. */
export function primaryListingPriceIsClosed(
  listing: ListingPriceSource,
): boolean {
  if (formatMlsStatus(listing?.status) !== 'Closed') return false
  const { closePrice } = closeFieldsFromListing(listing)
  return closePrice != null && closePrice > 0
}

export function buildCurrentListingEvents(listing: Listing): ListingHistoryEvent[] {
  const events: ListingHistoryEvent[] = []
  const statusLabel = formatMlsStatus(listing.status)
  const { closeDate, closePrice } = closeFieldsFromListing(listing)

  if (listing.listDate) {
    const opener =
      listing.originalListPrice != null
        ? fmtMoney(listing.originalListPrice)
        : listing.price != null
          ? fmtMoney(listing.price)
          : undefined
    events.push({
      date: listing.listDate,
      label: 'Listed on MLS',
      detail: opener,
      sortMs: parseMs(listing.listDate),
    })
  }

  if (
    listing.originalListPrice != null &&
    listing.price != null &&
    listing.originalListPrice > listing.price
  ) {
    const pct = Math.round(
      ((listing.originalListPrice - listing.price) / listing.originalListPrice) * 100,
    )
    events.push({
      date: listing.priceChangeTimestamp,
      label: 'Price reduced',
      detail: `${fmtMoney(listing.originalListPrice)} → ${fmtMoney(listing.price)} (−${pct}%)`,
      sortMs: parseMs(listing.priceChangeTimestamp) || parseMs(listing.modificationTimestamp),
    })
  } else if (
    listing.priceChangeTimestamp &&
    listing.originalListPrice != null &&
    listing.price != null &&
    listing.originalListPrice !== listing.price
  ) {
    events.push({
      date: listing.priceChangeTimestamp,
      label: 'Price changed',
      detail: `${fmtMoney(listing.originalListPrice)} → ${fmtMoney(listing.price)}`,
      sortMs: parseMs(listing.priceChangeTimestamp),
    })
  }

  if (listing.statusChangeTimestamp && statusLabel !== 'Active') {
    const detail =
      statusLabel === 'Closed' && closePrice != null
        ? `${statusLabel} · ${fmtMoney(closePrice)}`
        : statusLabel
    events.push({
      date: listing.statusChangeTimestamp,
      label: 'Status updated',
      detail,
      sortMs: parseMs(listing.statusChangeTimestamp),
    })
  }

  if (closeDate && formatMlsStatus(listing.status) === 'Closed') {
    events.push({
      date: closeDate,
      label: 'Closed',
      detail: closePrice != null ? fmtMoney(closePrice) : undefined,
      sortMs: parseMs(closeDate),
    })
  }

  if (
    listing.dom != null &&
    /active|pending/i.test(statusLabel) &&
    !events.some((e) => e.label.includes('days on market'))
  ) {
    events.push({
      date: null,
      label: `${listing.dom} days on market`,
      detail: statusLabel,
      sortMs: Date.now(),
    })
  }

  return events.sort((a, b) => b.sortMs - a.sortMs)
}

/** Drop sortMs and keep the newest N events for compact UAG / inline timelines. */
export function compactHistoryEvents(
  listing: Listing,
  limit = 4,
): Array<Pick<ListingHistoryEvent, 'date' | 'label' | 'detail'>> {
  return buildCurrentListingEvents(listing)
    .slice(0, limit)
    .map(({ date, label, detail }) =>
      detail != null && detail !== ''
        ? { date, label, detail }
        : { date, label },
    )
}

export function summarizePriorListing(listing: Listing): PriorListingSummary {
  const { closeDate, closePrice } = closeFieldsFromListing(listing)
  return {
    mlsId: listing.mlsId,
    status: formatMlsStatus(listing.status),
    listDate: listing.listDate,
    price: listing.price,
    originalListPrice: listing.originalListPrice,
    closeDate,
    closePrice,
    isRental: isRentalListing(listing),
  }
}

/** Closed price as a percent of last list (100 = sold/rented at list). */
export function closedVsLastListPct(
  lastListPrice: number | null | undefined,
  closedPrice: number | null | undefined,
): number | null {
  if (
    lastListPrice == null ||
    closedPrice == null ||
    !Number.isFinite(lastListPrice) ||
    !Number.isFinite(closedPrice) ||
    lastListPrice <= 0
  ) {
    return null
  }
  return Math.round((closedPrice / lastListPrice) * 100)
}
