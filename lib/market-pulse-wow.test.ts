import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MarketPulseCombinedTownRow } from './market-pulse-combined-rows'
import {
  buildMarketPulseWow,
  formatMarketPulseWowSlotLabel,
  marketPulseWowCaption,
  marketPulseWowTextFor,
} from './market-pulse-wow'

function row(
  city: string,
  partial: Partial<MarketPulseCombinedTownRow>,
): MarketPulseCombinedTownRow {
  return {
    city,
    activeCount: null,
    monthsSupply: null,
    avgDaysOnMarket: null,
    closedCount: null,
    medianPrice: null,
    averagePrice: null,
    priceDelta: null,
    priceDeltaPct: null,
    saleToAskPct: null,
    saleToAskDollars: null,
    medianTax: null,
    averageTax: null,
    taxDelta: null,
    taxDeltaPct: null,
    ...partial,
  }
}

describe('formatMarketPulseWowSlotLabel', () => {
  it('prints the Eastern send-day without a year', () => {
    assert.equal(formatMarketPulseWowSlotLabel('2026-09-07'), '7 Sep')
    assert.equal(formatMarketPulseWowSlotLabel('2026-09-14'), '14 Sep')
  })
})

describe('buildMarketPulseWow', () => {
  const prior = [
    row('All', {
      activeCount: 172,
      monthsSupply: 2.4,
      avgDaysOnMarket: 21,
      closedCount: 410,
      medianPrice: 1_200_000,
      averagePrice: 1_285_000,
      priceDelta: 85_000,
      saleToAskDollars: -12_000,
    }),
    row('Westport', {
      activeCount: 48,
      monthsSupply: 1.8,
      avgDaysOnMarket: 18,
      closedCount: 90,
      medianPrice: 2_000_000,
    }),
  ]
  const current = [
    row('All', {
      activeCount: 184,
      monthsSupply: 2.8,
      avgDaysOnMarket: 19,
      closedCount: 421,
      medianPrice: 1_225_000,
      averagePrice: 1_310_000,
      priceDelta: 90_000,
      saleToAskDollars: -8_000,
    }),
    row('Westport', {
      activeCount: 42,
      monthsSupply: 1.8,
      avgDaysOnMarket: 18,
      closedCount: 90,
      medianPrice: 2_000_000,
    }),
    row('Wilton', {
      activeCount: 12,
      monthsSupply: 3.1,
    }),
  ]

  it('subtracts last send-day from this one, town by town', () => {
    const wow = buildMarketPulseWow(current, prior, '2026-09-07')
    assert.ok(wow)
    assert.equal(wow.priorSlotDate, '2026-09-07')
    assert.equal(marketPulseWowCaption(wow), 'WoW vs 7 Sep')
    assert.equal(marketPulseWowTextFor(wow, 'All', 'inventory'), '+12')
    assert.equal(marketPulseWowTextFor(wow, 'All', 'monthsSupply'), '+0.4 mo')
    assert.equal(marketPulseWowTextFor(wow, 'All', 'avgDom'), '−2d')
    assert.equal(marketPulseWowTextFor(wow, 'All', 'closed'), '+11')
    assert.equal(marketPulseWowTextFor(wow, 'All', 'medianPrice'), '+$25K')
    assert.equal(marketPulseWowTextFor(wow, 'All Towns', 'inventory'), '+12')
    assert.equal(marketPulseWowTextFor(wow, 'Westport', 'inventory'), '−6')
    assert.equal(marketPulseWowTextFor(wow, 'Westport', 'monthsSupply'), '0.0 mo')
    assert.equal(marketPulseWowTextFor(wow, 'Wilton', 'inventory'), null)
  })

  it('returns null when the prior week has no overlapping towns', () => {
    assert.equal(
      buildMarketPulseWow(
        [row('Westport', { activeCount: 10 })],
        [row('Norwalk', { activeCount: 8 })],
        '2026-09-07',
      ),
      null,
    )
  })
})
