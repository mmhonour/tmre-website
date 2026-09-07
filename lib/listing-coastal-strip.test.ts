import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveListingCoastalStrip } from './listing-coastal-strip'

describe('listing coastal strip overrides', () => {
  it('keeps 772 Rowland on 2nd strip for What-if', () => {
    assert.equal(resolveListingCoastalStrip('24186969', 0), 1)
    assert.equal(resolveListingCoastalStrip('24186969', null), 1)
  })

  it('leaves other listings on the painted cell', () => {
    assert.equal(resolveListingCoastalStrip('24163818', 0), 0)
    assert.equal(resolveListingCoastalStrip('24145969', 3), 3)
    assert.equal(resolveListingCoastalStrip('24153317', null), null)
  })
})
