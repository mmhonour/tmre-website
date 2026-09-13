import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { VisionOwnerPortfolioParcel } from './vision-owner-keys'
import {
  nextOwnerPurchaseSort,
  parseOwnerPurchaseDateMs,
  sortOwnerPortfolioParcels,
} from './owner-portfolio-sort'

function parcel(
  address: string,
  date: string | null,
  price: number | null,
): VisionOwnerPortfolioParcel {
  return {
    town: 'Westport',
    visionPid: address,
    siteAddress: address,
    lastPaidPrice: price,
    lastPaidPriceLabel: price != null ? `$${price}` : null,
    lastPaidSaleDate: date,
  }
}

describe('parseOwnerPurchaseDateMs', () => {
  it('reads MM/DD/YYYY, not day-first', () => {
    const april = parseOwnerPurchaseDateMs('04/12/2019')
    const july = parseOwnerPurchaseDateMs('07/22/2021')
    assert.ok(april != null && july != null)
    assert.equal(april < july, true)
  })

  it('does not treat the printed string as sort order', () => {
    // Alphanumeric: 07/22/2021 < 09/03/2016. Clock: 2016 before 2021.
    const late = parseOwnerPurchaseDateMs('07/22/2021')
    const early = parseOwnerPurchaseDateMs('09/03/2016')
    assert.ok(late != null && early != null)
    assert.equal(early < late, true)
  })
})

describe('nextOwnerPurchaseSort', () => {
  it('starts date and amount descending', () => {
    assert.deepEqual(nextOwnerPurchaseSort(null, 'asc', 'date'), {
      key: 'date',
      dir: 'desc',
    })
    assert.deepEqual(nextOwnerPurchaseSort(null, 'asc', 'amount'), {
      key: 'amount',
      dir: 'desc',
    })
  })

  it('toggles the same column', () => {
    assert.deepEqual(nextOwnerPurchaseSort('date', 'desc', 'date'), {
      key: 'date',
      dir: 'asc',
    })
  })
})

describe('sortOwnerPortfolioParcels', () => {
  const rows = [
    parcel('40 Compo Rd', '09/03/2016', 1_875_000),
    parcel('8 Beachside Ave', '07/22/2021', 3_400_000),
    parcel('12 Main St', '04/12/2019', 2_150_000),
    parcel('No sale', null, null),
  ]

  it('sorts amount high to low with missing last', () => {
    const sorted = sortOwnerPortfolioParcels(rows, 'amount', 'desc').map(
      (row) => row.siteAddress,
    )
    assert.deepEqual(sorted, [
      '8 Beachside Ave',
      '12 Main St',
      '40 Compo Rd',
      'No sale',
    ])
  })

  it('sorts date newest first, not A–Z of MM/DD/YYYY', () => {
    const sorted = sortOwnerPortfolioParcels(rows, 'date', 'desc').map(
      (row) => row.siteAddress,
    )
    assert.deepEqual(sorted, [
      '8 Beachside Ave',
      '12 Main St',
      '40 Compo Rd',
      'No sale',
    ])
  })
})
