import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listingVisionAddressHref,
  type ListingVisionLink,
  type ListingVisionParcel,
} from './listing-vision-link-shared'

function parcel(pid: string, href: string | null = `/find/westport/${pid}`): ListingVisionParcel {
  return {
    visionPid: pid,
    parcelHref: href,
    fieldCardHref: null,
    vgsiHref: `https://gis.vgsi.com/westportct/Parcel.aspx?pid=${pid}`,
    addressFull: '16 Sea Spray Rd',
    mblu: null,
    useCode: null,
    ownerName: null,
    assessedValue: null,
    lastSalePrice: null,
    lastSaleDate: null,
    linkedMlsId: null,
  }
}

function link(partial: Partial<ListingVisionLink>): ListingVisionLink {
  return {
    town: 'Westport',
    stamped: false,
    parcel: null,
    candidates: [],
    danglingPid: null,
    ...partial,
  }
}

describe('listingVisionAddressHref', () => {
  it('uses the stamped parcel page', () => {
    assert.equal(
      listingVisionAddressHref(
        link({ stamped: true, parcel: parcel('3564') }),
        '16 Sea Spray Rd',
      ),
      '/find/westport/3564',
    )
  })

  it('uses a single address-matched candidate', () => {
    assert.equal(
      listingVisionAddressHref(link({ candidates: [parcel('99')] }), '1 Main'),
      '/find/westport/99',
    )
  })

  it('falls back to Find search when several candidates or none', () => {
    assert.equal(
      listingVisionAddressHref(
        link({ candidates: [parcel('1'), parcel('2')] }),
        '16 Sea Spray Rd',
      ),
      '/find?q=16%20Sea%20Spray%20Rd',
    )
    assert.equal(
      listingVisionAddressHref(null, '16 Sea Spray Rd'),
      '/find?q=16%20Sea%20Spray%20Rd',
    )
  })

  it('opens the dangling PID on the Westport parcel route', () => {
    assert.equal(
      listingVisionAddressHref(link({ stamped: true, danglingPid: '404' }), '1 Main'),
      '/find/westport/404',
    )
  })

  it('returns nothing with no vision and no address', () => {
    assert.equal(listingVisionAddressHref(null, ''), null)
  })
})
