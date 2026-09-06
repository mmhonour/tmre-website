import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { closedSearchWindowForSaleDate } from './find-listing-window'

describe('closedSearchWindowForSaleDate', () => {
  it('windows a Vision last-deed date to the surrounding calendar years', () => {
    assert.deepEqual(closedSearchWindowForSaleDate('2018-09-28', new Date('2026-09-06T00:00:00Z')), {
      closedAfter: '2017-01-01',
      closedBefore: '2019-12-31',
    })
  })

  it('falls back to 2000 through today when Vision has no deed date', () => {
    assert.deepEqual(closedSearchWindowForSaleDate(null, new Date('2026-09-06T12:00:00Z')), {
      closedAfter: '2000-01-01',
      closedBefore: '2026-09-06',
    })
  })

  it('ignores a malformed deed date', () => {
    assert.deepEqual(closedSearchWindowForSaleDate('September 2018', new Date('2026-09-06T12:00:00Z')), {
      closedAfter: '2000-01-01',
      closedBefore: '2026-09-06',
    })
  })
})
