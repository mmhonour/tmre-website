import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatVisionOwnerDisplay } from './vision-owner-display'

describe('formatVisionOwnerDisplay', () => {
  it('flips each person in an AND pair', () => {
    assert.equal(
      formatVisionOwnerDisplay('CASTILLO EDWARD AND SNYDER CAMERON'),
      'Edward Castillo and Cameron Snyder',
    )
  })

  it('keeps a middle initial with the given name', () => {
    assert.equal(
      formatVisionOwnerDisplay('MALTER VALERIE F AND KAYE STUART P'),
      'Valerie F Malter and Stuart P Kaye',
    )
  })

  it('flips a hyphenated last name and an ampersand pair', () => {
    assert.equal(
      formatVisionOwnerDisplay(
        'SLOSSBERG MATTHEW & CHAMMAH-SLOSSBERG EMMANUELLE',
      ),
      'Matthew Slossberg and Emmanuelle Chammah-Slossberg',
    )
  })

  it('does not flip an LLC or a trust', () => {
    assert.equal(
      formatVisionOwnerDisplay('ACME HOLDINGS LLC'),
      'Acme Holdings LLC',
    )
    assert.equal(
      formatVisionOwnerDisplay('SMITH FAMILY TRUST'),
      'Smith Family Trust',
    )
  })

  it('leaves a one-token line as title case', () => {
    assert.equal(formatVisionOwnerDisplay('WESTPORT'), 'Westport')
  })

  it('puts both given names before a shared last name', () => {
    assert.equal(
      formatVisionOwnerDisplay('THARP CHARLES & ADRIANNE'),
      'Charles & Adrianne Tharp',
    )
    assert.equal(
      formatVisionOwnerDisplay('THARP CHARLES & THARP ADRIANNE'),
      'Charles & Adrianne Tharp',
    )
    assert.equal(
      formatVisionOwnerDisplay('FEYGIN IRINA & YURY'),
      'Irina & Yury Feygin',
    )
  })

  it('keeps different last names as First Last and First Last', () => {
    assert.equal(
      formatVisionOwnerDisplay('MARKS TIMOTHY AND HONOUR MELISSA'),
      'Timothy Marks and Melissa Honour',
    )
  })
})
