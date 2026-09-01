import { NextResponse } from 'next/server'
import { readMonthsSupplyCached } from '@/lib/months-supply-cache'
import { readStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { statsCacheKey } from '@/lib/stats-compute'
import type { MarketStatsPayload } from '@/lib/stats-compute'
import { readMarketPulseClosedCounts } from '@/lib/market-pulse-closed-cache'
import { buildMarketPulseCombinedTownRows } from '@/lib/market-pulse-combined-rows'
import type { MarketPulseCombinedTownRow } from '@/lib/market-pulse-combined-rows'
import { buyerFriendlyScore } from '@/lib/market-pulse-favorability'
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  type MarketPulseLookbackId,
} from '@/lib/market-pulse-lookback'
import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import type { MonthsSupplyPayload } from '@/lib/months-supply-cache'
import type {
  MarketDigestDomTownCount,
  MarketDigestPriceTownCount,
} from '@/lib/market-digest-types'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROPERTY_CLASSES: ListingPropertyClass[] = ['all', 'homes', 'condos', 'multi']

export type MarketPulseTownPayload = {
  city: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
  closedLookbackLabel: string
  /** The requested town's combined metrics. */
  row: MarketPulseCombinedTownRow | null
  /** All-towns row, for context alongside the subject. */
  allRow: MarketPulseCombinedTownRow | null
  /**
   * Buyer-friendly composite in [0,1] — 1 is most buyer-friendly. Scored
   * against every peer town server-side; the client cannot do this without
   * fetching all towns.
   */
  buyerFriendly: number | null
  /** Peer count the score was ranked against. */
  peerCount: number
  /** Largest bar value per metric across peers, so bars can be scaled. */
  maxima: {
    activeCount: number
    monthsSupply: number
    avgDaysOnMarket: number
    closedCount: number
    medianPrice: number
    averagePrice: number
    priceDelta: number
    saleToAskDollars: number
  }
}

function parseMarketStats(
  row: { payload: string } | null,
): MarketStatsPayload | null {
  if (!row) return null
  try {
    return JSON.parse(row.payload) as MarketStatsPayload
  } catch {
    return null
  }
}

function maxOf(
  rows: readonly MarketPulseCombinedTownRow[],
  pick: (r: MarketPulseCombinedTownRow) => number | null,
): number {
  let max = 0
  for (const row of rows) {
    const value = pick(row)
    if (value != null && Number.isFinite(value)) {
      max = Math.max(max, Math.abs(value))
    }
  }
  return max
}

/**
 * One town's Market Pulse slice, assembled from the same stats-cache rows the
 * /market-pulse page reads. Exists so embedding surfaces do not fan out four
 * requests per town and re-derive the favourability ranking in the browser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const city = (url.searchParams.get('city') ?? '').trim()
  if (!city) {
    return NextResponse.json({ error: 'city required' }, { status: 400 })
  }

  const kind: ListingKind =
    url.searchParams.get('kind') === 'rental' ? 'rental' : 'sale'
  const requested = (url.searchParams.get('property') ?? 'all') as ListingPropertyClass
  const propertyClass = PROPERTY_CLASSES.includes(requested) ? requested : 'all'
  const lookbackId = (url.searchParams.get('lookback') ??
    DEFAULT_MARKET_PULSE_LOOKBACK_ID) as MarketPulseLookbackId

  const cities = ['All', ...TMRE_TOWNS]

  try {
    const [inventory, marketRows, closed] = await Promise.all([
      Promise.all(
        cities.map((name) => readMonthsSupplyCached(name, kind, propertyClass)),
      ),
      Promise.all(
        cities.map(async (name) => ({
          city: name,
          stats: parseMarketStats(
            await readStatsCacheRow(statsCacheKey('market-stats', name, kind)),
          ),
        })),
      ),
      readMarketPulseClosedCounts(
        { kind, propertyClass, lookbackId },
        { allowCompute: true },
      ),
    ])

    const inventoryRows = inventory.filter(
      (row): row is MonthsSupplyPayload => row != null,
    )

    const domRows: MarketDigestDomTownCount[] = marketRows
      .filter((r) => r.stats?.avgDaysOnMarket != null)
      .map((r) => ({
        city: r.city,
        avgDaysOnMarket: r.stats!.avgDaysOnMarket as number,
        avgDaysOnMarketCalc: r.stats!.avgDaysOnMarketCalc,
      }))

    const priceRows: MarketDigestPriceTownCount[] = marketRows
      .filter((r) => r.stats != null)
      .map((r) => ({
        city: r.city,
        medianPrice: r.stats!.medianPrice ?? null,
        averagePrice: r.stats!.averagePrice ?? null,
        medianPriceCalc: r.stats!.medianPriceCalc,
        averagePriceCalc: r.stats!.averagePriceCalc,
      }))

    const combined = buildMarketPulseCombinedTownRows(
      inventoryRows,
      domRows,
      closed.payload.rows,
      priceRows,
    )

    const wanted = city.trim().toLowerCase()
    const row = combined.find((r) => r.city.trim().toLowerCase() === wanted) ?? null
    const allRow =
      combined.find((r) => r.city.trim().toLowerCase() === 'all') ?? null
    const peers = combined.filter((r) => r.city.trim().toLowerCase() !== 'all')

    const payload: MarketPulseTownPayload = {
      city: row?.city ?? city,
      kind,
      propertyClass,
      closedLookbackLabel: closed.payload.lookbackLabel,
      row,
      allRow,
      buyerFriendly: row ? buyerFriendlyScore(row, peers) : null,
      peerCount: peers.length,
      maxima: {
        activeCount: maxOf(peers, (r) => r.activeCount),
        monthsSupply: maxOf(peers, (r) => r.monthsSupply),
        avgDaysOnMarket: maxOf(peers, (r) => r.avgDaysOnMarket),
        closedCount: maxOf(peers, (r) => r.closedCount),
        medianPrice: maxOf(peers, (r) => r.medianPrice),
        averagePrice: maxOf(peers, (r) => r.averagePrice),
        priceDelta: maxOf(peers, (r) => r.priceDelta),
        saleToAskDollars: maxOf(peers, (r) => r.saleToAskDollars),
      },
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/market-pulse/town] failed', err)
    return NextResponse.json(
      { error: 'Failed to load town pulse' },
      { status: 503 },
    )
  }
}
