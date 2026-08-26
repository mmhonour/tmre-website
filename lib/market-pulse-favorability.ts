/**
 * Market Pulse Buyer / Seller Friendly town ranking.
 *
 * Higher composite = more buyer-friendly. Seller Friendly sorts the reverse.
 *
 * Live factors today (buyer-friendly direction):
 *   Months supply larger, avg DOM larger, closed smaller,
 *   median smaller, delta smaller, average smaller.
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

/** Average of per-factor ranks in [0, 1]; null if no live factors present. */
export function buyerFriendlyScore(
  inputs: MarketPulseFavorInputs,
  peers: readonly MarketPulseFavorInputs[],
): number | null {
  const factors: {
    of: (i: MarketPulseFavorInputs) => number | null
    /** True when a larger raw value is more buyer-friendly. */
    buyerHigher: boolean
  }[] = [
    { of: (i) => finiteOrNull(i.monthsSupply), buyerHigher: true },
    { of: (i) => finiteOrNull(i.avgDaysOnMarket), buyerHigher: true },
    { of: (i) => finiteOrNull(i.closedCount), buyerHigher: false },
    { of: (i) => finiteOrNull(i.medianPrice), buyerHigher: false },
    { of: (i) => finiteOrNull(i.priceDelta), buyerHigher: false },
    { of: (i) => finiteOrNull(i.averagePrice), buyerHigher: false },
    { of: (i) => finiteOrNull(i.inventoryPerHome), buyerHigher: true },
    { of: (i) => finiteOrNull(i.closed24moPerHome), buyerHigher: true },
  ]

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
      ranks.push(factor.buyerHigher ? high : 1 - high)
    }
  }
  if (ranks.length === 0) return null
  return ranks.reduce((a, b) => a + b, 0) / ranks.length
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
