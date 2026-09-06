import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  completeDanglingDeedOwner,
  visionDeedDisplayRows,
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
})
