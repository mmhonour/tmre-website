import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compileVisionOwnerFromDeeds,
  compileVisionOwnerParts,
  completeDanglingDeedOwner,
  formatVisionMoney,
  visionCurrentWarrantyOwnerLine,
  visionDeedDisplayRows,
  visionLastPaidSale,
  visionOwnerLinesMirror,
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

describe('compileVisionOwnerParts', () => {
  const deeds = [
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
  ] as const

  it('puts later quitclaim grantees on their own lines after the warranty buyers', () => {
    const parts = compileVisionOwnerParts(deeds)
    assert.deepEqual(parts.displayLines, [
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
      'ADDED COUSIN',
      'ADDED AUNT',
    ])
    assert.equal(
      parts.displayName,
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE & ADDED COUSIN & ADDED AUNT',
    )
  })

  it('stays one line when there is no later quitclaim', () => {
    const parts = compileVisionOwnerParts(
      [
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
    assert.deepEqual(parts.displayLines, [
      'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
    ])
  })

  it('drops a quitclaim that mirrors the warranty buyers', () => {
    const parts = compileVisionOwnerParts(
      [
        {
          owner: 'CASTILLO EDWARD AND SNYDER CAMERON',
          date: '09/12/2016',
          price: '0',
          bookPage: '3729/0032',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'CASTILLO EDWARD AND SYNDER CAMERON',
          date: '11/03/2014',
          price: '1530000',
          bookPage: '3565/0068',
          qualified: 'Q',
          instrument: '00',
        },
      ],
      'CASTILLO EDWARD AND SNYDER CAMERON',
    )
    assert.deepEqual(parts.displayLines, [
      'CASTILLO EDWARD AND SNYDER CAMERON',
    ])
    assert.equal(parts.displayName, 'CASTILLO EDWARD AND SNYDER CAMERON')
  })

  it('picks the current warranty buyer, not a superseded 1993 warranty (38 Ferry / King)', () => {
    const ownership = [
      {
        owner: 'KING AL W III',
        date: '11/18/2020',
        price: '800000',
        bookPage: '4065/0297',
        qualified: 'Q',
        instrument: '00',
      },
      {
        owner: 'GRIMALDI RICHARD',
        date: '10/18/1993',
        price: '165000',
        bookPage: '1270/0069',
        qualified: 'Q',
        instrument: '—',
      },
    ]
    assert.equal(
      visionCurrentWarrantyOwnerLine(ownership, 'KING AL W III'),
      'KING AL W III',
    )
    const parts = compileVisionOwnerParts(ownership, 'KING AL W III')
    assert.equal(parts.displayLines[0], 'KING AL W III')
  })

  it('keeps Grimaldi as current warranty on the house he still owns (40 Ferry)', () => {
    const ownership = [
      {
        owner: 'GRIMALDI RICHARD',
        date: '12/15/1993',
        price: '175000',
        bookPage: '1280/0010',
        qualified: 'Q',
        instrument: '00',
      },
    ]
    assert.equal(
      visionCurrentWarrantyOwnerLine(ownership, 'GRIMALDI RICHARD'),
      'GRIMALDI RICHARD',
    )
  })
})

describe('visionOwnerLinesMirror', () => {
  it('treats AND vs & and a one-letter last-name slip as the same line', () => {
    assert.equal(
      visionOwnerLinesMirror(
        'CASTILLO EDWARD AND SYNDER CAMERON',
        'CASTILLO EDWARD AND SNYDER CAMERON',
      ),
      true,
    )
  })

  it('does not collapse a one-letter first-name change on a short token', () => {
    assert.equal(
      visionOwnerLinesMirror('SMITH JOHN', 'SMITH JOAN'),
      false,
    )
  })
})
