import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  overlayClosedCounts,
  overlayWeekTax,
  taxByCityFromPoints,
  weekPointFromAsofRow,
} from './market-pulse-week-asof-map'
import { addIsoDays, pickPriorSlotDate } from './market-pulse-wow'

describe('weekPointFromAsofRow', () => {
  it('maps SQL numerics onto stacked town points including MOS and sale-to-ask', () => {
    const point = weekPointFromAsofRow({
      city: 'Westport',
      active_count: '143',
      closed_12mo: '353',
      avg_dom: '64.01',
      med_price: '2050000',
      avg_price: '2520191.65',
      sta_n: '2',
      sta_closed: '100',
      sta_orig: '140',
      avg_monthly_closings: '42.333333',
    })
    assert.equal(point.city, 'Westport')
    assert.equal(point.activeCount, 143)
    assert.equal(point.closedCount, 353)
    assert.ok(point.monthsSupply != null)
    assert.equal(point.monthsSupply?.toFixed(3), (143 / 42.333333).toFixed(3))
    assert.equal(point.saleToAskDollars, (100 - 140) / 2)
    assert.equal(point.priceDelta, 2520191.65 - 2050000)
    assert.equal(point.medianTax, null)
  })
})

describe('overlayWeekTax', () => {
  it('fills missing tax from the live week and keeps archived tax', () => {
    const points = [
      weekPointFromAsofRow({
        city: 'Westport',
        active_count: 1,
        closed_12mo: 1,
        avg_dom: null,
        med_price: null,
        avg_price: null,
        sta_n: 0,
        sta_closed: null,
        sta_orig: null,
        avg_monthly_closings: null,
      }),
      {
        ...weekPointFromAsofRow({
          city: 'Wilton',
          active_count: 1,
          closed_12mo: 1,
          avg_dom: null,
          med_price: null,
          avg_price: null,
          sta_n: 0,
          sta_closed: null,
          sta_orig: null,
          avg_monthly_closings: null,
        }),
        medianTax: 9000,
        averageTax: 10000,
        taxDelta: 1000,
      },
    ]
    const overlaid = overlayWeekTax(
      points,
      taxByCityFromPoints([
        {
          city: 'Westport',
          medianTax: 11111,
          averageTax: 12222,
          taxDelta: 1111,
        },
        {
          city: 'Wilton',
          medianTax: 1,
          averageTax: 2,
          taxDelta: 3,
        },
      ]),
    )
    assert.equal(overlaid[0]?.medianTax, 11111)
    assert.equal(overlaid[1]?.medianTax, 9000)
  })
})

describe('overlayClosedCounts', () => {
  it('fills null closed counts from the 12-month cache', () => {
    const rows = [
      { city: 'All', closedCount: null as number | null },
      { city: 'Westport', closedCount: 353 as number | null },
    ]
    overlayClosedCounts(
      rows,
      new Map([
        ['all', 2474],
        ['westport', 10],
      ]),
    )
    assert.equal(rows[0]?.closedCount, 2474)
    assert.equal(rows[1]?.closedCount, 353)
  })
})

describe('prior Monday for WoW', () => {
  it('needs a slot strictly before this week’s Monday', () => {
    assert.equal(addIsoDays('2026-09-14', -7), '2026-09-07')
    assert.equal(pickPriorSlotDate(['2026-09-14'], '2026-09-14', 1), null)
    assert.equal(
      pickPriorSlotDate(['2026-09-14', '2026-09-07'], '2026-09-14', 1),
      '2026-09-07',
    )
  })
})
