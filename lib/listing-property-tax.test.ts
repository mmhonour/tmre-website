import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPropertyTaxHistorySlots,
  formatTaxYoyChange,
  taxYoyChangePct,
} from './listing-property-tax'

describe('taxYoyChangePct', () => {
  it('is (this − prior) / prior as a one-decimal percent', () => {
    assert.equal(taxYoyChangePct(6171, 6092.46), 1.3)
    assert.equal(taxYoyChangePct(6092.46, 6004.12), 1.5)
    assert.equal(taxYoyChangePct(5912.5, 6004.12), -1.5)
    assert.equal(taxYoyChangePct(100, 100), 0)
  })

  it('is null when either amount is missing or the prior year is zero', () => {
    assert.equal(taxYoyChangePct(6171, null), null)
    assert.equal(taxYoyChangePct(null, 6092), null)
    assert.equal(taxYoyChangePct(6171, undefined), null)
    assert.equal(taxYoyChangePct(6171, 0), null)
  })
})

describe('formatTaxYoyChange', () => {
  it('signs percent increases and decreases', () => {
    assert.equal(formatTaxYoyChange(1.3), '+1.3%')
    assert.equal(formatTaxYoyChange(-1.5), '−1.5%')
    assert.equal(formatTaxYoyChange(0), '0%')
    assert.equal(formatTaxYoyChange(null), null)
  })
})

describe('buildPropertyTaxHistorySlots', () => {
  it('attaches YoY percent from the prior fiscal year', () => {
    const slots = buildPropertyTaxHistorySlots(
      2026,
      [
        { taxYearEnd: 2026, taxYearLabel: 'July 2025-June 2026', amount: 6171 },
        { taxYearEnd: 2025, taxYearLabel: 'July 2024-June 2025', amount: 6092.46 },
        { taxYearEnd: 2024, taxYearLabel: 'July 2023-June 2024', amount: 6004.12 },
        { taxYearEnd: 2023, taxYearLabel: 'July 2022-June 2023', amount: 5912.5 },
        { taxYearEnd: 2022, taxYearLabel: 'July 2021-June 2022', amount: 5800 },
        { taxYearEnd: 2021, taxYearLabel: 'July 2020-June 2021', amount: 5700 },
      ],
      5,
    )

    assert.equal(slots[0]?.yoyChangePct, 1.3)
    assert.equal(slots[1]?.yoyChangePct, 1.5)
    assert.equal(slots[2]?.yoyChangePct, 1.5)
    assert.equal(slots[3]?.yoyChangePct, 1.9)
    assert.equal(slots[4]?.amount, 5800)
    assert.equal(slots[4]?.yoyChangePct, 1.8)
  })

  it('leaves YoY blank when the prior year has no amount', () => {
    const slots = buildPropertyTaxHistorySlots(
      2026,
      [{ taxYearEnd: 2026, taxYearLabel: 'July 2025-June 2026', amount: 6171 }],
      5,
    )
    assert.equal(slots[0]?.yoyChangePct, null)
    assert.equal(slots[1]?.amount, null)
    assert.equal(slots[1]?.yoyChangePct, null)
  })
})
