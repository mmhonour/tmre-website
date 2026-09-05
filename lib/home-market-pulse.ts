import 'server-only'

import { townMarketTagline } from '@/lib/intelligence-town-taglines'
import type { HomeMarketPulseTown } from '@/lib/home-market-pulse-types'
import { readStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { monthsSupplyCacheKey } from '@/lib/months-supply-cache'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'
import {
  statsCacheKey,
  type MarketStatsPayload,
  type SalesByMonthPayload,
} from '@/lib/stats-compute'
import { getActiveKnownCoverageTowns } from '@/lib/ct-coverage'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type { HomeMarketPulseTown } from '@/lib/home-market-pulse-types'

const TREND_4W = 'Past 4 weeks'
const TREND_4W_VOLUME = 'Sum of close prices · 4w'
const TREND_4W_NONE = 'None in 4 weeks'

/**
 * Fallback numerics (and sale-to-list until we cache that ratio) — same ballpark
 * as the former hardcoded home cards / Intelligence mock.
 */
const SEED: Record<
  TmreTown,
  Omit<HomeMarketPulseTown, 'town' | 'tagline'>
> = {
  Norwalk: {
    medianPrice: 711_000,
    daysOnMarket: 12,
    saleToList: 102.8,
    monthsSupply: 1.7,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+4.2% YoY',
      daysOnMarket: '−3 vs Q1',
      saleToList: 'Premium market',
      monthsSupply: "Seller's market",
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  'New Canaan': {
    medianPrice: 1_650_000,
    daysOnMarket: 11,
    saleToList: 101.1,
    monthsSupply: 2.2,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+5.1% YoY',
      daysOnMarket: 'Moving fast',
      saleToList: 'Above ask',
      monthsSupply: 'Lean',
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  Westport: {
    medianPrice: 1_940_000,
    daysOnMarket: 8,
    saleToList: 101.9,
    monthsSupply: 2.1,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+6.1% YoY',
      daysOnMarket: '−2 vs Q1',
      saleToList: 'Premium market',
      monthsSupply: 'Tight inventory',
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  Wilton: {
    medianPrice: 1_120_000,
    daysOnMarket: 14,
    saleToList: 100.6,
    monthsSupply: 2.4,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+4.8% YoY',
      daysOnMarket: '−1 vs Q1',
      saleToList: 'At ask',
      monthsSupply: 'Moderate',
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  Weston: {
    medianPrice: 1_050_000,
    daysOnMarket: 16,
    saleToList: 99.8,
    monthsSupply: 2.8,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+3.9% YoY',
      daysOnMarket: 'Steady',
      saleToList: 'At ask',
      monthsSupply: 'Moderate',
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  Fairfield: {
    medianPrice: 875_000,
    daysOnMarket: 10,
    saleToList: 101.5,
    monthsSupply: 1.9,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+5.3% YoY',
      daysOnMarket: '−2 vs Q1',
      saleToList: 'Above ask',
      monthsSupply: "Seller's market",
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
  Ridgefield: {
    medianPrice: 1_080_000,
    daysOnMarket: 15,
    saleToList: 100.2,
    monthsSupply: 2.5,
    closedLast4Weeks: null,
    closedLast4WeeksVolume: null,
    trends: {
      medianPrice: '+4.5% YoY',
      daysOnMarket: 'Steady',
      saleToList: 'At ask',
      monthsSupply: 'Moderate',
      closedLast4Weeks: TREND_4W,
      closedLast4WeeksVolume: TREND_4W,
    },
  },
}

function parsePayload<T>(row: { payload: string } | null): T | null {
  if (!row?.payload) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

async function enrichTown(town: TmreTown): Promise<HomeMarketPulseTown> {
  const seed = SEED[town]
  const base: HomeMarketPulseTown = {
    town,
    tagline: townMarketTagline(town),
    ...seed,
  }

  try {
    const [marketRow, monthsRow, salesRow] = await Promise.all([
      readStatsCacheRow(statsCacheKey('market-stats', town, 'sale')),
      readStatsCacheRow(monthsSupplyCacheKey(town, 'sale', 'homes')),
      readStatsCacheRow(statsCacheKey('sales-by-month', town, 'sale')),
    ])
    const market = parsePayload<MarketStatsPayload>(marketRow)
    const months = parsePayload<MonthsSupplyPayload>(monthsRow)
    const sales = parsePayload<SalesByMonthPayload>(salesRow)

    if (market?.medianPrice != null && Number.isFinite(market.medianPrice)) {
      base.medianPrice = market.medianPrice
    }
    if (
      market?.avgDaysOnMarket != null &&
      Number.isFinite(market.avgDaysOnMarket)
    ) {
      base.daysOnMarket = market.avgDaysOnMarket
    }
    if (months?.monthsSupply != null && Number.isFinite(months.monthsSupply)) {
      base.monthsSupply = months.monthsSupply
      base.trends = {
        ...base.trends,
        monthsSupply:
          months.monthsSupply <= 2
            ? "Seller's market"
            : months.monthsSupply <= 4
              ? 'Balanced'
              : "Buyer's market",
      }
    }
    if (sales && typeof sales.closedLast4Weeks === 'number') {
      base.closedLast4Weeks = sales.closedLast4Weeks
      base.trends = {
        ...base.trends,
        closedLast4Weeks:
          sales.closedLast4Weeks > 0 ? TREND_4W : TREND_4W_NONE,
      }
    }
    if (
      sales &&
      typeof sales.closedLast4WeeksVolume === 'number' &&
      Number.isFinite(sales.closedLast4WeeksVolume)
    ) {
      base.closedLast4WeeksVolume = sales.closedLast4WeeksVolume
      base.trends = {
        ...base.trends,
        closedLast4WeeksVolume:
          sales.closedLast4WeeksVolume > 0 ? TREND_4W_VOLUME : TREND_4W_NONE,
      }
    }
  } catch {
    /* seed is fine when Neon / cache unavailable */
  }

  return base
}

/** Active CT coverage towns (known zip/MLS set) for the home Market Pulse grid. */
export async function loadHomeMarketPulseTowns(): Promise<HomeMarketPulseTown[]> {
  const towns = await getActiveKnownCoverageTowns()
  const list = towns.length > 0 ? towns : [...TMRE_TOWNS]
  return Promise.all(list.map((town) => enrichTown(town)))
}
