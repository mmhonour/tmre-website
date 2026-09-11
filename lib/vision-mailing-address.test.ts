import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatVisionMailingAddress,
  parseVisionMailingLetterParts,
  visionMailingStreetDiffers,
} from './vision-mailing-address'

describe('parseVisionMailingLetterParts', () => {
  it('splits VGSI street + city + state', () => {
    assert.deepEqual(parseVisionMailingLetterParts('9 PINE ST, WESTPORT, CT'), {
      name: null,
      street: '9 PINE ST',
      cityState: 'WESTPORT, CT',
    })
  })

  it('keeps a zip on the city/state line', () => {
    assert.deepEqual(
      parseVisionMailingLetterParts('PO BOX 212, WESTPORT, CT 06880'),
      {
        name: null,
        street: 'PO BOX 212',
        cityState: 'WESTPORT, CT 06880',
      },
    )
  })

  it('lifts a leading name off the street', () => {
    assert.deepEqual(
      parseVisionMailingLetterParts('JOHN SMITH, 9 PINE ST, WESTPORT, CT'),
      {
        name: 'JOHN SMITH',
        street: '9 PINE ST',
        cityState: 'WESTPORT, CT',
      },
    )
  })

  it('respects existing carriage returns', () => {
    assert.deepEqual(
      parseVisionMailingLetterParts('9 PINE ST\nWESTPORT, CT'),
      {
        name: null,
        street: '9 PINE ST',
        cityState: 'WESTPORT, CT',
      },
    )
  })
})

describe('visionMailingStreetDiffers', () => {
  it('treats Ln / Lane as the same residence street', () => {
    assert.equal(
      visionMailingStreetDiffers('5 Locust Ln', '5 LOCUST LANE', 'Westport'),
      false,
    )
  })

  it('flags a different street or a PO box', () => {
    assert.equal(
      visionMailingStreetDiffers('5 Locust Ln', '9 PINE ST', 'Westport'),
      true,
    )
    assert.equal(
      visionMailingStreetDiffers('5 Locust Ln', 'PO BOX 212', 'Westport'),
      true,
    )
  })
})

describe('formatVisionMailingAddress', () => {
  it('labels and wraps an offsite mailing like a letter', () => {
    const block = formatVisionMailingAddress({
      mailing: '9 PINE ST, WESTPORT, CT',
      residenceStreet: '5 Locust Ln',
      town: 'Westport',
      ownerName: 'SMITH JOHN',
    })
    assert.equal(block.offsite, true)
    assert.deepEqual(block.letterLines, [
      'SMITH JOHN',
      '9 PINE ST',
      'WESTPORT, CT',
    ])
    assert.deepEqual(block.labeledLines, [
      'Mailing Address',
      'SMITH JOHN',
      '9 PINE ST',
      'WESTPORT, CT',
    ])
  })

  it('hides the labeled block when mailing is the residence', () => {
    const block = formatVisionMailingAddress({
      mailing: '5 LOCUST LN, WESTPORT, CT',
      residenceStreet: '5 Locust Ln',
      town: 'Westport',
      ownerName: 'SMITH JOHN',
    })
    assert.equal(block.offsite, false)
    assert.deepEqual(block.letterLines, [
      'SMITH JOHN',
      '5 LOCUST LN',
      'WESTPORT, CT',
    ])
    assert.deepEqual(block.labeledLines, [])
  })

  it('does not repeat a name already in the mailing', () => {
    const block = formatVisionMailingAddress({
      mailing: 'JOHN SMITH, 9 PINE ST, WESTPORT, CT',
      residenceStreet: '5 Locust Ln',
      town: 'Westport',
      ownerName: 'JOHN SMITH',
    })
    assert.deepEqual(block.letterLines, [
      'JOHN SMITH',
      '9 PINE ST',
      'WESTPORT, CT',
    ])
  })

  it('keeps VGSI last-first when the mailing name is first-last', () => {
    const block = formatVisionMailingAddress({
      mailing: 'JOHN SMITH, 9 PINE ST, WESTPORT, CT',
      residenceStreet: '5 Locust Ln',
      town: 'Westport',
      ownerName: 'SMITH JOHN',
    })
    assert.deepEqual(block.letterLines, [
      'SMITH JOHN',
      '9 PINE ST',
      'WESTPORT, CT',
    ])
  })
})
