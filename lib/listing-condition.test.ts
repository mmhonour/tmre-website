import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listingConditionRank,
  resolveListingCondition,
} from './listing-condition'

describe('listing condition grades', () => {
  it('assigns the hand-graded Fairfield coastal comps', () => {
    assert.equal(resolveListingCondition({ mlsId: '24186969' }), 'good')
    assert.equal(listingConditionRank('good'), 2)
    assert.equal(resolveListingCondition({ mlsId: '24149919' }), 'excellent')
    assert.equal(resolveListingCondition({ mlsId: '24201368' }), 'excellent')
    assert.equal(resolveListingCondition({ mlsId: '24145969' }), 'excellent')
    assert.equal(resolveListingCondition({ mlsId: '24163818' }), 'excellent')
    assert.equal(resolveListingCondition({ mlsId: '24126283' }), 'fair')
    assert.equal(resolveListingCondition({ mlsId: '24153317' }), 'good')
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
