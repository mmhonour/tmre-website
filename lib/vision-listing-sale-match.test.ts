import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listingFitsVisionParcel,
  visionListingSaleRole,
  visionParcelMlsPrice,
} from './vision-listing-sale-match'

const PAID = { date: '08/30/2017', year: 2017, price: 1_700_000 }

describe('visionListingSaleRole', () => {
  it('keeps a live listing even when the last deed is older', () => {
    assert.equal(
      visionListingSaleRole({ status: 'Active', price: 2_100_000 }, PAID),
      'live',
    )
    assert.equal(
      visionListingSaleRole(
        { status: 'Under Contract', price: 2_050_000 },
        PAID,
      ),
      'live',
    )
  })

  it('treats a prior land close as not the Vision house deed', () => {
    const land = {
      status: 'Closed',
      price: 575_000,
      raw: {
        ClosePrice: '540000',
        CloseDate: '2016-07-29',
      },
    }
    assert.equal(visionListingSaleRole(land, PAID), 'prior')
    assert.equal(listingFitsVisionParcel(land, PAID), false)
    assert.equal(visionParcelMlsPrice(land, PAID), 1_700_000)
  })

  it('accepts a Closed MLS that is the paid deed', () => {
    const house = {
      status: 'Closed',
      price: 1_750_000,
      raw: {
        ClosePrice: '1700000',
        CloseDate: '2017-08-15',
      },
    }
    assert.equal(visionListingSaleRole(house, PAID), 'deed')
    assert.equal(listingFitsVisionParcel(house, PAID), true)
    assert.equal(visionParcelMlsPrice(house, PAID), 1_700_000)
  })

  it('does not treat a same-year cheap close as the expensive deed', () => {
    const other = {
      status: 'Closed',
      price: 575_000,
      raw: { ClosePrice: '540000', CloseDate: '2017-06-01' },
    }
    assert.equal(visionListingSaleRole(other, PAID), 'prior')
  })

  it('allows a Closed listing when Vision has no paid deed to compare', () => {
    const land = {
      status: 'Closed',
      price: 575_000,
      raw: { ClosePrice: '540000', CloseDate: '2016-07-29' },
    }
    assert.equal(visionListingSaleRole(land, null), 'closed')
    assert.equal(listingFitsVisionParcel(land, null), true)
    assert.equal(visionParcelMlsPrice(land, null), 540_000)
  })
})
