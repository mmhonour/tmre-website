/**
 * Market Pulse Buyer / Seller Friendly town ranking.
 *
 * Higher composite = more buyer-friendly. Seller Friendly sorts the reverse.
 *
 * Live factors today (buyer-friendly direction):
 *   Months supply larger, avg DOM larger, closed smaller,
 *   median smaller, delta smaller, average smaller,
 *   list-to-ask smaller.
 * Seller Friendly is the reverse of each.
 *
 * Planned (catalogue on Town stats / most current year we have):
 *   Active inventory ÷ housing unit count (higher → buyer)
 *   Closings in trailing 24 months ÷ housing unit count (higher → buyer)
 */

export type MarketPulseFavorSort = 'default' | 'sellers' | 'buyers'

export type MarketPulseUnstackedMetricId =
  | 'inventory'
  | 'monthsSupply'
  | 'avgDom'
  | 'closed'
  | 'medianPrice'
  | 'averagePrice'
  | 'priceDelta'
  | 'saleToAsk'

/** Seller-friendly direction per unstacked chart (buyer is the reverse). */
const SELLER_UNSTACKED_DIR: Record<MarketPulseUnstackedMetricId, 'asc' | 'desc'> =
  {
    inventory: 'asc',
    monthsSupply: 'asc',
    avgDom: 'asc',
    closed: 'desc',
    medianPrice: 'desc',
    averagePrice: 'desc',
    priceDelta: 'desc',
    // Closing nearer (or above) the first ask is the seller-friendly end.
    saleToAsk: 'desc',
  }

/** Per-chart ASC/DESC when unstacked + Seller/Buyer Friendly. Null = snapshot order. */
export function unstackedFavorSortDir(
  favor: MarketPulseFavorSort,
  metric: MarketPulseUnstackedMetricId,
): 'asc' | 'desc' | null {
  if (favor === 'default') return null
  const seller = SELLER_UNSTACKED_DIR[metric]
  if (favor === 'sellers') return seller
  return seller === 'asc' ? 'desc' : 'asc'
}

/** One town’s inputs for the composite (null = factor unavailable). */
export type MarketPulseFavorInputs = {
  monthsSupply: number | null | undefined
  avgDaysOnMarket: number | null | undefined
  closedCount?: number | null | undefined
  medianPrice?: number | null | undefined
  priceDelta?: number | null | undefined
  averagePrice?: number | null | undefined
  /** Close ÷ original ask as a percent — above 100 means closing over ask. */
  saleToAskPct?: number | null | undefined
  /** Planned: active ÷ homes in town. */
  inventoryPerHome?: number | null | undefined
  /** Planned: closed trailing 24 months ÷ homes in town. */
  closed24moPerHome?: number | null | undefined
}

export type MarketPulseFavorFactorId =
  | 'monthsSupply'
  | 'avgDaysOnMarket'
  | 'closedCount'
  | 'medianPrice'
  | 'priceDelta'
  | 'averagePrice'
  | 'saleToAskPct'
  | 'inventoryPerHome'
  | 'closed24moPerHome'

export const MARKET_PULSE_FAVOR_FACTORS: {
  id: MarketPulseFavorFactorId
  label: string
  status: 'live' | 'planned'
  buyerDirection: 'higher'
  notes: string
}[] = [
  {
    id: 'monthsSupply',
    label: 'Months supply',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Active ÷ avg monthly closings. One factor — not the whole story.',
  },
  {
    id: 'avgDaysOnMarket',
    label: 'Avg days on market',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Longer DOM → more buyer friendly.',
  },
  {
    id: 'closedCount',
    label: 'Closed',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Fewer closings in the lookback → more buyer friendly.',
  },
  {
    id: 'medianPrice',
    label: 'Median',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Lower median → more buyer friendly.',
  },
  {
    id: 'priceDelta',
    label: 'Delta',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Smaller average−median gap → more buyer friendly.',
  },
  {
    id: 'averagePrice',
    label: 'Average',
    status: 'live',
    buyerDirection: 'higher',
    notes: 'Lower average → more buyer friendly.',
  },
  {
    id: 'saleToAskPct',
    label: 'List to ask',
    status: 'live',
    buyerDirection: 'higher',
    notes:
      'Closing further under the first ask → more buyer friendly; at or over ask → seller.',
  },
  {
    id: 'inventoryPerHome',
    label: 'Inventory per home',
    status: 'planned',
    buyerDirection: 'higher',
    notes:
      'Active listings ÷ town housing unit count (Town stats, most current year).',
  },
  {
    id: 'closed24moPerHome',
    label: 'Closings (24 mo) per home',
    status: 'planned',
    buyerDirection: 'higher',
    notes:
      'Closed last 24 months ÷ housing unit count (Town stats, most current year).',
  },
]

function finiteOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null
}

const FAVOR_FACTORS: {
  of: (i: MarketPulseFavorInputs) => number | null
  /** True when a larger raw value is more buyer-friendly. */
  buyerHigher: boolean
  /**
   * A town total rather than a level. An All-towns row sums its towns, so it
   * always sits past the peer range and cannot be ranked against them.
   */
  townTotal?: boolean
}[] = [
  { of: (i) => finiteOrNull(i.monthsSupply), buyerHigher: true },
  { of: (i) => finiteOrNull(i.avgDaysOnMarket), buyerHigher: true },
  { of: (i) => finiteOrNull(i.closedCount), buyerHigher: false, townTotal: true },
  { of: (i) => finiteOrNull(i.medianPrice), buyerHigher: false },
  { of: (i) => finiteOrNull(i.priceDelta), buyerHigher: false },
  { of: (i) => finiteOrNull(i.averagePrice), buyerHigher: false },
  { of: (i) => finiteOrNull(i.saleToAskPct), buyerHigher: false },
  { of: (i) => finiteOrNull(i.inventoryPerHome), buyerHigher: true },
  { of: (i) => finiteOrNull(i.closed24moPerHome), buyerHigher: true },
]

/** Average of per-factor ranks in [0, 1]; null if no live factors present. */
export function buyerFriendlyScore(
  inputs: MarketPulseFavorInputs,
  peers: readonly MarketPulseFavorInputs[],
  options?: {
    /** Score a market aggregate: drop the factors that are town totals. */
    aggregate?: boolean
  },
): number | null {
  const factors = options?.aggregate
    ? FAVOR_FACTORS.filter((f) => !f.townTotal)
    : FAVOR_FACTORS

  const ranks: number[] = []
  for (const factor of factors) {
    const self = factor.of(inputs)
    if (self == null) continue
    const values = peers
      .map((p) => factor.of(p))
      .filter((v): v is number => v != null)
    if (values.length === 0) continue
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (max === min) {
      ranks.push(0.5)
    } else {
      const high = (self - min) / (max - min)
      const rank = factor.buyerHigher ? high : 1 - high
      ranks.push(Math.max(0, Math.min(1, rank)))
    }
  }
  if (ranks.length === 0) return null
  return ranks.reduce((a, b) => a + b, 0) / ranks.length
}

/**
 * Composite for every row, keyed by city. Towns are ranked against each other;
 * an All-towns row is ranked against those same towns on its level factors, so
 * the market reads on the one scale its towns do.
 */
export function buyerFriendlyScoreByCity<T extends { city: string }>(
  rows: readonly T[],
  inputsOf: (row: T) => MarketPulseFavorInputs,
  isAllTowns: (row: T) => boolean,
): Map<string, number> {
  const peers = rows.filter((r) => !isAllTowns(r)).map(inputsOf)
  const byCity = new Map<string, number>()
  for (const row of rows) {
    const score = buyerFriendlyScore(inputsOf(row), peers, {
      aggregate: isAllTowns(row),
    })
    if (score != null) byCity.set(row.city, score)
  }
  return byCity
}

/** Seller end first — the order a heat scale is drawn in. */
export const MARKET_PULSE_HEAT_BAND_IDS = [
  'seller-hot',
  'seller-warm',
  'balanced',
  'buyer-warm',
  'buyer-hot',
] as const

export type MarketPulseHeatBandId =
  (typeof MARKET_PULSE_HEAT_BAND_IDS)[number]

export type MarketPulseHeatBand = {
  id: MarketPulseHeatBandId
  /** Caption on the strip, e.g. `Seller hot`. */
  label: string
  /** The same reading from the other side, e.g. `buyer cold`. */
  counter: string
}

const HEAT_BANDS: readonly (MarketPulseHeatBand & { max: number })[] = [
  { max: 0.2, id: 'seller-hot', label: 'Seller hot', counter: 'buyer cold' },
  { max: 0.4, id: 'seller-warm', label: 'Seller warm', counter: 'buyer cool' },
  { max: 0.6, id: 'balanced', label: 'Balanced', counter: 'no side favoured' },
  { max: 0.8, id: 'buyer-warm', label: 'Buyer warm', counter: 'seller cool' },
  { max: 1.01, id: 'buyer-hot', label: 'Buyer hot', counter: 'seller cold' },
]

/** Composite (0 = seller end, 1 = buyer end) → heat band. */
export function marketPulseHeatBand(score: number): MarketPulseHeatBand {
  const clamped = Math.max(0, Math.min(1, score))
  const band = HEAT_BANDS.find((b) => clamped < b.max) ?? HEAT_BANDS[4]
  return { id: band.id, label: band.label, counter: band.counter }
}

/** One-line reading, e.g. `Seller hot — buyer cold`. */
export function marketPulseHeatLabel(score: number): string {
  const band = marketPulseHeatBand(score)
  return `${band.label} — ${band.counter}`
}

export function sortRowsByBuyerFriendlyScore<T>(
  rows: T[],
  inputsOf: (row: T) => MarketPulseFavorInputs,
  favor: MarketPulseFavorSort,
  isAllTowns: (row: T) => boolean,
): T[] {
  if (favor === 'default') return rows
  const head = rows.filter(isAllTowns)
  const rest = rows.filter((r) => !isAllTowns(r))
  const peerInputs = rest.map(inputsOf)
  const scored = rest.map((row) => ({
    row,
    score: buyerFriendlyScore(inputsOf(row), peerInputs),
  }))
  scored.sort((a, b) => {
    const aOk = a.score != null
    const bOk = b.score != null
    if (!aOk && !bOk) return 0
    if (!aOk) return 1
    if (!bOk) return -1
    // buyers: high score first; sellers: low score first
    return favor === 'buyers'
      ? b.score! - a.score!
      : a.score! - b.score!
  })
  return [...head, ...scored.map((s) => s.row)]
}
