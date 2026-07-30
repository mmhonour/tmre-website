/**
 * Single source of truth for /latest badge rules and feed ranking.
 * Imported by the feed builder (server) and Admin → Architecture → Status
 * logic (client) so the logic surface cannot drift from the code that applies it.
 *
 * Keep this file free of `server-only` and free of DB / RETS imports.
 */

/** Genuinely new inventory: DOM inside this window, or listed inside it. */
export const NEW_LISTING_MAX_DOM = 7

/**
 * How long a recorded UC / Temp-off-market → Active flip is still news.
 * Applies to the exact `previous_mls_status` signal.
 */
export const BACK_ON_MARKET_WINDOW_DAYS = 14

/**
 * Prior MLS statuses that qualify an Active listing as Back on Market.
 * Withdrawn / generic off-market / heuristic (no previous status) do not qualify.
 */
export const BACK_ON_MARKET_SOURCE_LABELS = [
  'Coming Soon',
  'Under Contract',
  'Under Contract - Continue to Show',
  'Temp off market',
] as const

/** Real MLS events that earn a /latest slot. Plain Active / Pending never appear. */
export const LATEST_EVENT_STATUSES = [
  'Coming Soon',
  'New',
  'Back on Market',
  'Reduced',
  'Increased',
] as const

export type LatestEventStatus = (typeof LATEST_EVENT_STATUSES)[number]

/** Badges shown on /latest — same set as event statuses (no filler Active/Pending). */
export const LATEST_BADGE_STATUSES = LATEST_EVENT_STATUSES

export type LatestBadgeStatus = LatestEventStatus

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
  /** Whether this status claims a priority feed slot (all /latest rows do). */
  event: boolean
  /** Plain-language rule. */
  rule: string
}

/**
 * Badge precedence for /latest. First match wins — same order as `deriveStatus`
 * in `lib/latest-listings.ts`. Rows that match none of these are excluded.
 */
export const LATEST_STATUS_PRECEDENCE: readonly LatestStatusRuleRow[] = [
  {
    order: 1,
    status: 'Coming Soon',
    badge: 'Coming Soon',
    event: true,
    rule: 'MLS status is Coming Soon (or CS).',
  },
  {
    order: 2,
    status: 'Back on Market',
    badge: 'Back on Mkt',
    event: true,
    rule: `Currently Active, previous MLS status was Coming Soon, Under Contract, Under Contract – Continue to Show, or Temp off market, and the flip was within ${BACK_ON_MARKET_WINDOW_DAYS} days. Evaluated before New so a Coming Soon → Active flip is not relabelled New.`,
  },
  {
    order: 3,
    status: 'New',
    badge: 'New',
    event: true,
    rule: `Days on market ≤ ${NEW_LISTING_MAX_DOM}, or list date within the last ${NEW_LISTING_MAX_DOM} days (and not already Back on Market).`,
  },
  {
    order: 4,
    status: 'Reduced',
    badge: 'Reduced',
    event: true,
    rule: 'List price is lower than original list price (any amount).',
  },
  {
    order: 5,
    status: 'Increased',
    badge: 'Increased',
    event: true,
    rule: 'List price is higher than original list price (any amount).',
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
    label: 'Keep event rows only',
    detail:
      'Coming Soon, New, Back on Market, Reduced, and Increased. Pending and plain Active (remarks/photos/minor edits) never appear.',
  },
  {
    order: 2,
    label: 'Seed one row per TMRE town when available',
    detail:
      'Each of the 7 towns claims its top-ranked event row first when it has one — quiet towns with no qualifying events are simply omitted.',
  },
  {
    order: 3,
    label: 'Fill by Eastern calendar day, then timestamp',
    detail:
      'Take all qualifying events from today (America/New_York), newest timestamp first. If fewer than 30, fill from the prior day the same way, then any older days. Cap at 30. /latest does not call RETS — it reads this feed cache (or Postgres when the cache is rejected as stale).',
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
    usedFor: 'Coming Soon; Active gate for Back on Market',
  },
  {
    field: 'list_date',
    source: 'ListingContractDate (Eastern calendar day)',
    usedFor: 'New inventory window',
  },
  {
    field: 'DOM',
    source: 'MLS days on market',
    usedFor: 'New inventory window',
  },
  {
    field: 'previous_mls_status',
    source: 'Captured on upsert when mls_status changes (migration 0010)',
    usedFor:
      'Back on Market from Coming Soon, UC, UC-CTS, or Temp off market',
  },
  {
    field: 'previous_status_changed_at / status_change_timestamp',
    source: 'Upsert bookkeeping / MLS StatusChangeTimestamp',
    usedFor: 'How recent the flip to Active was',
  },
  {
    field: 'price vs original_list_price',
    source: 'Listing fields',
    usedFor: 'Reduced (any cut) or Increased (any raise)',
  },
  {
    field: 'modification_timestamp + list_date',
    source: 'MLS clocks',
    usedFor:
      'Activity ranking — Eastern calendar day (today, then prior day), then timestamp desc',
  },
]
