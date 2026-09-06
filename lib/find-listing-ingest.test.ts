import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listingIngestTown } from './find-listing-ingest-shared'
import { closedSearchWindowForSaleDate } from './find-listing-window'

describe('listingIngestTown', () => {
  it('prefers Vision town over city and does not hardcode Westport', () => {
    assert.equal(listingIngestTown({ town: 'Norwalk', city: 'Westport' }), 'Norwalk')
    assert.equal(listingIngestTown({ town: '', city: 'Wilton' }), 'Wilton')
    assert.equal(listingIngestTown('Greenwich'), 'Greenwich')
    assert.equal(listingIngestTown(null), 'Westport')
  })
})

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
