import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCurrentListingEvents,
  fmtDate,
} from './listing-history'
import type { Listing } from './rets'

function listing(
  partial: Partial<Listing> & Pick<Listing, 'status'>,
): Listing {
  return {
    mlsId: '24166415',
    listingKey: 'k',
    propertyType: 'Residential',
    style: '',
    address: {
      street: '91 Turkey Hill Road South',
      unit: '',
      city: 'Westport',
      state: 'CT',
      postalCode: '',
      full: '91 Turkey Hill Road South, Westport, CT',
    },
    price: 3_395_000,
    originalListPrice: 3_395_000,
    beds: null,
    baths: null,
    sqft: null,
    lotAcres: null,
    furnished: null,
    yearBuilt: null,
    dom: null,
    listDate: '2026-04-13',
    modificationTimestamp: null,
    priceChangeTimestamp: null,
    statusChangeTimestamp: null,
    latitude: null,
    longitude: null,
    photoCount: null,
    ownerName: null,
    remarks: null,
    schools: {
      elementary: null,
      middle: null,
      high: null,
      district: null,
    },
    raw: {},
    ...partial,
  }
}

describe('fmtDate', () => {
  it('prints a date-only CloseDate as that civil day, not UTC-shifted', () => {
    assert.equal(fmtDate('2026-09-14'), 'Sep 14, 2026')
  })

  it('prints midnight-with-zeros as the civil day on the ISO date', () => {
    assert.equal(fmtDate('2026-09-14T00:00:00.000Z'), 'Sep 14, 2026')
    assert.equal(fmtDate('2026-09-14T00:00:00-04:00'), 'Sep 14, 2026')
  })

  it('prints a real timestamp in Eastern', () => {
    assert.equal(fmtDate('2026-09-14T18:09:00Z'), 'Sep 14, 2026')
  })
})

describe('buildCurrentListingEvents', () => {
  it('keeps one Closed row and skips Status updated Closed when CloseDate exists', () => {
    const events = buildCurrentListingEvents(
      listing({
        status: 'Closed',
        listDate: '2026-04-13',
        statusChangeTimestamp: '2026-09-14T18:09:00Z',
        price: 3_395_000,
        originalListPrice: 3_395_000,
        raw: {
          CloseDate: '2026-09-14',
          ClosePrice: '3200000',
        },
      }),
    )
    const labels = events.map((e) => e.label)
    assert.equal(labels.filter((l) => l === 'Closed').length, 1)
    assert.ok(!labels.includes('Status updated'))
    assert.ok(!labels.includes('Price reduced'))
    assert.ok(!labels.includes('Price changed'))
  })
})
