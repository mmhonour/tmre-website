/**
 * Single source of truth for /latest badge rules and feed ranking.
 * Imported by the feed builder (server) and Admin → Syncs → Latest health
 * (client) so the logic surface cannot drift from the code that applies it.
 *
 * Keep this file free of `server-only` and free of DB / RETS imports.
 */

/** Genuinely new inventory: DOM inside this window, or listed inside it. */
export const NEW_LISTING_MAX_DOM = 7

/**
 * How long a recorded Under Contract → Active (or off-market → Active) flip is
 * still news. Applies to the exact `previous_mls_status` signal.
 */
export const BACK_ON_MARKET_WINDOW_DAYS = 14

/**
 * Fallback window (days) for rows with no recorded previous status: only a very
 * recent MLS status change counts, since we cannot see what it changed from.
 */
export const BACK_ON_MARKET_HEURISTIC_WINDOW_DAYS = 3

/**
 * Past this DOM a re-activated listing is clearly not new inventory.
 * Parked decision: keep 14 (errs toward not over-claiming) vs relax to 7.
 */
export const BACK_ON_MARKET_MIN_DOM = 14

/** Price cut above this percent earns the Reduced badge. */
export const REDUCED_MIN_PERCENT = 1

/** Real MLS events that outrank routine modifications for the 30 feed slots. */
export const LATEST_EVENT_STATUSES = [
  'Coming Soon',
  'New',
  'Back on Market',
  'Reduced',
] as const

export type LatestEventStatus = (typeof LATEST_EVENT_STATUSES)[number]

export const LATEST_BADGE_STATUSES = [
  'Pending',
  'Coming Soon',
  'New',
  'Back on Market',
  'Reduced',
  'Active',
] as const

export type LatestBadgeStatus = (typeof LATEST_BADGE_STATUSES)[number]

export function isLatestEventStatus(status: string | null | undefined): boolean {
  return (
    status != null &&
    (LATEST_EVENT_STATUSES as readonly string[]).includes(status)
  )
}

export type LatestStatusRuleRow = {
  /** Evaluation order — first match wins. */
  order: number
  status: LatestBadgeStatus
  /** Short badge label shown on /latest (may be abbreviated on mobile). */
  badge: string
  /** Whether this status claims a priority feed slot over plain Active. */
  event: boolean
  /** Plain-language rule. */
  rule: string
}

/**
 * Badge precedence for /latest. First match wins — same order as `deriveStatus`
 * in `lib/latest-listings.ts`.
 */
export const LATEST_STATUS_PRECEDENCE: readonly LatestStatusRuleRow[] = [
  {
    order: 1,
    status: 'Pending',
    badge: 'Pending',
    event: false,
    rule: 'MLS status is Pending.',
  },
  {
    order: 2,
    status: 'Coming Soon',
    badge: 'Coming Soon',
    event: true,
    rule: 'MLS status is Coming Soon (or CS). No longer relabelled as New.',
  },
  {
    order: 3,
    status: 'New',
    badge: 'New',
    event: true,
    rule: `Days on market ≤ ${NEW_LISTING_MAX_DOM}, or list date within the last ${NEW_LISTING_MAX_DOM} days.`,
  },
  {
    order: 4,
    status: 'Back on Market',
    badge: 'Back on Mkt',
    event: true,
    rule: `Currently Active, and either (a) previous MLS status was Under Contract / Continue to Show / withdrawn / off-market within ${BACK_ON_MARKET_WINDOW_DAYS} days, or (b) no previous status recorded yet — status changed in the last ${BACK_ON_MARKET_HEURISTIC_WINDOW_DAYS} days and DOM ≥ ${BACK_ON_MARKET_MIN_DOM}.`,
  },
  {
    order: 5,
    status: 'Reduced',
    badge: 'Reduced',
    event: true,
    rule: `Price cut greater than ${REDUCED_MIN_PERCENT}% vs original list price.`,
  },
  {
    order: 6,
    status: 'Active',
    badge: 'Active',
    event: false,
    rule: 'Everything else that is still Active — remarks edits, photo swaps, sub-1% price tweaks.',
  },
]

export type LatestRankingStep = {
  order: number
  label: string
  detail: string
}

/** How the 30 feed slots are filled after badges are assigned. */
export const LATEST_FEED_RANKING: readonly LatestRankingStep[] = [
  {
    order: 1,
    label: 'Seed one row per TMRE town',
    detail:
      'Coverage wins: each of the 7 towns claims its own top-ranked row first, so a quiet town is never squeezed out.',
  },
  {
    order: 2,
    label: 'Fill remaining slots by rank',
    detail:
      'Within the last 24 hours of activity: event statuses (Coming Soon, New, Back on Market, Reduced) above plain Active/Pending. Then the same split for older activity. Recency is preserved inside each group.',
  },
  {
    order: 3,
    label: 'Cap at 30',
    detail:
      'Display order is the ranked set. /latest does not call RETS — it reads this feed cache (or Postgres when the cache is rejected as stale / incomplete).',
  },
]

/** Signals the badge engine reads. */
export const LATEST_STATUS_INPUTS: readonly {
  field: string
  source: string
  usedFor: string
}[] = [
  {
    field: 'mls_status / listing.status',
    source: 'RETS → listings row',
    usedFor: 'Pending, Coming Soon, Active gate for Back on Market',
  },
  {
    field: 'list_date',
    source: 'ListingContractDate (Eastern calendar day)',
    usedFor: 'New inventory window',
  },
  {
    field: 'DOM',
    source: 'MLS days on market',
    usedFor: 'New vs Back on Market heuristic',
  },
  {
    field: 'previous_mls_status',
    source: 'Captured on upsert when mls_status changes (migration 0010)',
    usedFor: 'Exact Back on Market signal (UC / withdrawn → Active)',
  },
  {
    field: 'previous_status_changed_at / status_change_timestamp',
    source: 'Upsert bookkeeping / MLS StatusChangeTimestamp',
    usedFor: 'How recent the flip to Active was',
  },
  {
    field: 'price vs original_list_price',
    source: 'Listing fields',
    usedFor: `Reduced when cut > ${REDUCED_MIN_PERCENT}%`,
  },
  {
    field: 'modification_timestamp + list_date',
    source: 'MLS clocks',
    usedFor: 'Activity ranking (freshest of the two)',
  },
]
