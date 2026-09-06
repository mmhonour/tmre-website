import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compileVisionOwnerFromDeeds,
  completeDanglingDeedOwner,
  formatVisionMoney,
  visionDeedDisplayRows,
  visionLastPaidSale,
} from './vision-gis-parse'

describe('completeDanglingDeedOwner', () => {
  it('fills the current VGSI deed line from the joined owner of record', () => {
    assert.equal(
      completeDanglingDeedOwner(
        'SLOSSBERG MATTHEW &',
        'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
      ),
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
    )
  })

  it('leaves a prior deed owner alone', () => {
    assert.equal(
      completeDanglingDeedOwner(
        'MALTER VALERIE F AND KAYE STUART P',
        'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
      ),
      'MALTER VALERIE F AND KAYE STUART P',
    )
  })
})

describe('visionDeedDisplayRows', () => {
  it('completes only the dangling current owner row', () => {
    const rows = visionDeedDisplayRows(
      [
        {
          owner: 'SLOSSBERG MATTHEW &',
          date: '09/28/2018',
          price: '1575000',
          bookPage: '3885/0087',
          qualified: 'Q',
          instrument: '00',
        },
        {
          owner: 'MALTER VALERIE F AND KAYE STUART P',
          date: '01/19/2007',
          price: '1350000',
          bookPage: '2762/0188',
          qualified: 'Q',
          instrument: '00',
        },
      ],
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
    )
    assert.equal(
      rows[0]?.owner,
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
    )
    assert.equal(rows[1]?.owner, 'MALTER VALERIE F AND KAYE STUART P')
  })

  it('shows $0 on a quitclaim instead of hiding the row', () => {
    const rows = visionDeedDisplayRows(
      [
        {
          owner: 'ADDED COUSIN',
          date: '04/01/2020',
          price: '0',
          bookPage: '4000/0001',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'SLOSSBERG MATTHEW &',
          date: '09/28/2018',
          price: '1575000',
          bookPage: '3885/0087',
          qualified: 'Q',
          instrument: '00',
        },
      ],
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
    )
    assert.equal(rows[0]?.priceLabel, '$0')
    assert.equal(rows[0]?.paid, false)
    assert.equal(rows[1]?.priceLabel, '$1,575,000')
    assert.equal(rows[1]?.paid, true)
  })

  it('still shows a quitclaim whose stored price is a dash', () => {
    const rows = visionDeedDisplayRows([
      {
        owner: 'ADDED COUSIN',
        date: '04/01/2020',
        price: '—',
        bookPage: '4000/0001',
        qualified: 'U',
        instrument: '29',
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.priceLabel, '$0')
    assert.equal(rows[0]?.deedLabel, 'Quitclaim (29)')
    assert.equal(rows[0]?.paid, false)
  })
})

describe('visionLastPaidSale', () => {
  it('uses the first non-quitclaim consideration, not a later $0 deed', () => {
    const paid = visionLastPaidSale({
      ownership: [
        {
          owner: 'ADDED COUSIN',
          date: '04/01/2020',
          price: '0',
          bookPage: '4000/0001',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
          date: '09/28/2018',
          price: '1575000',
          bookPage: '3885/0087',
          qualified: 'Q',
          instrument: '00',
        },
      ],
    })
    assert.equal(paid?.price, 1575000)
    assert.equal(formatVisionMoney(paid?.price), '$1,575,000')
    assert.equal(paid?.date, '09/28/2018')
  })
})

describe('compileVisionOwnerFromDeeds', () => {
  it('adds later quitclaim names onto the last paid sale', () => {
    const name = compileVisionOwnerFromDeeds(
      [
        {
          owner: 'ADDED COUSIN',
          date: '04/01/2020',
          price: '0',
          bookPage: '4000/0001',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'ADDED AUNT',
          date: '06/01/2021',
          price: '—',
          bookPage: '4100/0002',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
          date: '09/28/2018',
          price: '1575000',
          bookPage: '3885/0087',
          qualified: 'Q',
          instrument: '00',
        },
      ],
    )
    assert.equal(
      name,
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE & ADDED COUSIN & ADDED AUNT',
    )
  })
})
