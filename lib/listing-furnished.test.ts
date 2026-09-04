import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultFurnishedMatchScope,
  parseFurnishedFromRentalDuration,
  subjectHasFurnishedCriteria,
} from './listing-furnished'

describe('listing-furnished', () => {
  it('treats yearly furnished + unfurnished as Negotiable', () => {
    assert.equal(
      parseFurnishedFromRentalDuration('Yearly Unfurnished,Yearly Furnished'),
      'Negotiable',
    )
  })

  it('does not require exact furnish when the subject is Negotiable', () => {
    assert.equal(subjectHasFurnishedCriteria('Negotiable'), true)
    assert.equal(defaultFurnishedMatchScope('Negotiable'), 'any')
    assert.equal(defaultFurnishedMatchScope('Furnished'), 'exact')
    assert.equal(defaultFurnishedMatchScope('Partially'), 'exact')
    assert.equal(defaultFurnishedMatchScope('Unfurnished'), null)
    assert.equal(defaultFurnishedMatchScope(null), null)
  })
})
