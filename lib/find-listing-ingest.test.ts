import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listingIngestTown } from './find-listing-ingest-shared'
import {
  closedSearchDateForVision,
  closedSearchWindowForSaleDate,
} from './find-listing-window'

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

  it('windows VGSI MM/DD/YYYY the same as ISO', () => {
    assert.deepEqual(
      closedSearchWindowForSaleDate('09/12/2016', new Date('2026-09-10T00:00:00Z')),
      {
        closedAfter: '2015-01-01',
        closedBefore: '2017-12-31',
      },
    )
  })

  it('windows a deed year buried in September 2018', () => {
    assert.deepEqual(
      closedSearchWindowForSaleDate('September 2018', new Date('2026-09-06T12:00:00Z')),
      {
        closedAfter: '2017-01-01',
        closedBefore: '2019-12-31',
      },
    )
  })
})

describe('closedSearchDateForVision', () => {
  it('uses the paid purchase, not a later $0 quitclaim', () => {
    assert.equal(
      closedSearchDateForVision({
        lastSaleDate: '09/12/2016',
        lastSalePrice: 0,
        fieldCard: {
          ownership: [
            {
              date: '09/12/2016',
              owner: 'CASTILLO EDWARD AND SNYDER CAMERON',
              price: '$0',
              bookPage: '3729/0032',
              qualified: null,
              instrument: '29',
            },
            {
              date: '11/03/2014',
              owner: 'CASTILLO EDWARD AND SYNDER CAMERON',
              price: '$1,530,000',
              bookPage: '3565/0068',
              qualified: null,
              instrument: '00',
            },
          ],
        },
      }),
      '11/03/2014',
    )
    assert.deepEqual(
      closedSearchWindowForSaleDate(
        closedSearchDateForVision({
          lastSaleDate: '09/12/2016',
          lastSalePrice: 0,
          fieldCard: {
            ownership: [
              {
                date: '09/12/2016',
                owner: 'CASTILLO',
                price: '$0',
                bookPage: null,
                qualified: null,
                instrument: '29',
              },
              {
                date: '11/03/2014',
                owner: 'CASTILLO',
                price: '$1,530,000',
                bookPage: null,
                qualified: null,
                instrument: '00',
              },
            ],
          },
        }),
        new Date('2026-09-10T00:00:00Z'),
      ),
      {
        closedAfter: '2013-01-01',
        closedBefore: '2015-12-31',
      },
    )
  })
})
