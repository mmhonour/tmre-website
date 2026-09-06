import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildMarketPulseCombinedTownRows } from './market-pulse-combined-rows'

describe('buildMarketPulseCombinedTownRows tax slice', () => {
  it('joins cached five-year tax without deriving it from other rows', () => {
    const rows = buildMarketPulseCombinedTownRows(
      [
        {
          city: 'Westport',
          kind: 'sale',
          propertyClass: 'all',
          activeCount: 10,
          avgMonthlyClosings: 2,
          monthsSupply: 3,
          generatedAt: '2026-09-06T00:00:00.000Z',
        },
      ],
      [],
      [],
      [],
      [
        {
          city: 'Westport',
          medianTax: 12_000,
          averageTax: 14_000,
          taxDelta: 2_000,
          taxDeltaPct: 16.7,
          taxYearLabel: 'July 2026-June 2027',
          sampleSize: 40,
        },
      ],
    )
    assert.equal(rows[0]?.medianTax, 12_000)
    assert.equal(rows[0]?.averageTax, 14_000)
    assert.equal(rows[0]?.taxDelta, 2_000)
    assert.equal(rows[0]?.taxYearLabel, 'July 2026-June 2027')
  })

  it('leaves tax blank when the listing year is missing from cache', () => {
    const rows = buildMarketPulseCombinedTownRows(
      [
        {
          city: 'Westport',
          kind: 'sale',
          propertyClass: 'all',
          activeCount: 10,
          avgMonthlyClosings: 2,
          monthsSupply: 3,
          generatedAt: '2026-09-06T00:00:00.000Z',
        },
      ],
      [],
      [],
      [],
      [],
    )
    assert.equal(rows[0]?.medianTax, null)
    assert.equal(rows[0]?.taxDelta, null)
  })
})
