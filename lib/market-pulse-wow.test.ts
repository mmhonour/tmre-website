import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MarketPulseCombinedTownRow } from './market-pulse-combined-rows'
import { transactToListLabel, TRANSACT_TO_LIST_LABEL } from './market-pulse-defaults'
import {
  addIsoDays,
  availableComparePeriods,
  buildMarketPulseWow,
  formatMarketPulseWowSlotLabel,
  marketPulseCompareCaption,
  marketPulseCompareBlurbLines,
  marketPulseFillDeltaText,
  marketPulseWowCaption,
  marketPulseWowTextFor,
  pickEmailMarketPulseCompare,
  pickPriorSlotDate,
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
    assert.equal(marketPulseWowCaption(wow), 'Week over week vs 7 Sep')
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

  it('omits quiet zeros from the beside-chart blurb', () => {
    const wow = buildMarketPulseWow(current, prior, '2026-09-07')
    const lines = marketPulseCompareBlurbLines(wow, 'Westport')
    assert.ok(!lines.some((l) => l.id === 'monthsSupply'))
    assert.ok(lines.some((l) => l.id === 'inventory' && l.text === '−6'))
    assert.equal(marketPulseFillDeltaText(wow, 'Westport', 'inventory'), '−6')
    assert.equal(marketPulseFillDeltaText(wow, 'Westport', 'monthsSupply'), null)
    assert.equal(marketPulseFillDeltaText(wow, 'Westport', 'closed'), null)
  })
})

describe('transactToListLabel', () => {
  it('is over list when close beats original ask, under list when it does not', () => {
    assert.equal(transactToListLabel(22_000), 'Tran$act over list')
    assert.equal(transactToListLabel(-8_000), 'Tran$act under list')
    assert.equal(transactToListLabel(0), TRANSACT_TO_LIST_LABEL)
    assert.equal(transactToListLabel(null), TRANSACT_TO_LIST_LABEL)
  })
})

describe('pickEmailMarketPulseCompare', () => {
  it('uses WoW only for the weekly email; no month fallback', () => {
    const wow = buildMarketPulseWow(
      [row('All', { activeCount: 10 })],
      [row('All', { activeCount: 8 })],
      '2026-09-07',
    )
    const mom = buildMarketPulseWow(
      [row('All', { activeCount: 10 })],
      [row('All', { activeCount: 20 })],
      '2026-08-10',
    )
    assert.ok(wow && mom)
    const picked = pickEmailMarketPulseCompare({ wow, mom, yoy: null })
    assert.equal(picked?.period, 'wow')
    assert.equal(pickEmailMarketPulseCompare({ wow: null, mom, yoy: null }), null)
    assert.equal(
      pickEmailMarketPulseCompare({ wow: null, mom: null, yoy: mom }),
      null,
    )
    assert.deepEqual(availableComparePeriods({ wow, mom, yoy: null }), ['wow', 'mom'])
    assert.deepEqual(
      availableComparePeriods({ wow: null, mom, yoy: null }),
      ['mom'],
    )
    assert.equal(
      marketPulseCompareCaption(mom, 'mom'),
      'Month over month vs 10 Aug',
    )
  })
})

describe('pickPriorSlotDate', () => {
  const slots = ['2026-09-14', '2026-09-07', '2026-08-10', '2025-09-15']

  it('walks back one Monday for WoW, a month for MoM, a year for YoY', () => {
    assert.equal(pickPriorSlotDate(slots, '2026-09-14', 1), '2026-09-07')
    assert.equal(pickPriorSlotDate(slots, '2026-09-14', 28), '2026-08-10')
    assert.equal(pickPriorSlotDate(slots, '2026-09-14', 365), null)
    assert.equal(pickPriorSlotDate(slots, '2026-09-14', 350), '2025-09-15')
    assert.equal(addIsoDays('2026-09-14', -28), '2026-08-17')
  })
})
