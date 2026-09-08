import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractVisionOwnerKeys,
  visionOwnerClusterId,
  visionOwnerMailingKeyNorm,
  visionOwnerNameKeyNorm,
} from './vision-owner-keys'

describe('visionOwnerNameKeyNorm', () => {
  it('keeps VGSI last-first order', () => {
    assert.equal(visionOwnerNameKeyNorm('CASTILLO EDWARD'), 'castillo|edward')
  })
})

describe('visionOwnerMailingKeyNorm', () => {
  it('canonicalizes Rd vs Road on the mailing street', () => {
    const key = visionOwnerMailingKeyNorm(
      '12 MAIN STREET, WESTPORT, CT 06880',
      'Westport',
    )
    assert.equal(key?.keyNorm, '12 main st|westport')
  })
})

describe('extractVisionOwnerKeys', () => {
  it('emits mailing plus each person on a joint owner line', () => {
    const keys = extractVisionOwnerKeys({
      town: 'Westport',
      ownerName: 'CASTILLO EDWARD AND SNYDER CAMERON',
      ownerMailingAddress: '2A STONY PT RD, WESTPORT, CT 06880',
      ownership: [
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
    })
    assert.deepEqual(
      keys.map((row) => `${row.keyKind}:${row.keyNorm}`),
      [
        'mailing:2a stony pt rd|westport',
        'name:castillo|edward',
        'name:snyder|cameron',
      ],
    )
    assert.equal(
      visionOwnerClusterId('name', 'castillo|edward'),
      'name:castillo|edward',
    )
  })
})
