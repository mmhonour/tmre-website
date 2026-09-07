import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listingConditionRank,
  resolveListingCondition,
} from './listing-condition'

describe('listing condition grades', () => {
  it('assigns 772 Rowland Excellent via the per-listing override', () => {
    assert.equal(resolveListingCondition({ mlsId: '24186969' }), 'excellent')
    assert.equal(listingConditionRank('excellent'), 1)
  })

  it('treats new construction as Excellent', () => {
    assert.equal(
      resolveListingCondition({
        mlsId: 'new-build',
        yearBuilt: new Date().getFullYear(),
        propertyType: 'New Construction',
      }),
      'excellent',
    )
  })

  it('leaves ungraded resales unknown', () => {
    assert.equal(
      resolveListingCondition({
        mlsId: 'unknown',
        yearBuilt: 1928,
        propertyType: 'Single Family',
      }),
      null,
    )
  })
})
