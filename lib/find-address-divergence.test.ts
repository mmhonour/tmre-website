import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findAddressDivergence,
  findAddressLinesDiverge,
} from './find-address-divergence'

describe('findAddressLinesDiverge', () => {
  it('is silent when Vision and MLS already match', () => {
    assert.equal(
      findAddressLinesDiverge('16 Sea Spray Rd', '16 Sea Spray Rd'),
      false,
    )
    assert.equal(
      findAddressLinesDiverge('16  SEA SPRAY RD', '16 Sea Spray Rd'),
      false,
    )
  })

  it('flags 2A Stony Pt vs MLS 2A-A Stony Point', () => {
    assert.equal(
      findAddressLinesDiverge('2A STONY PT RD', '2A-A Stony Point Road'),
      true,
    )
  })

  it('does not flag a missing MLS line', () => {
    assert.equal(findAddressLinesDiverge('2A STONY PT RD', null), false)
    assert.equal(findAddressLinesDiverge('2A STONY PT RD', ''), false)
  })
})

describe('findAddressDivergence', () => {
  it('returns both lines and the flag for the Find page', () => {
    assert.deepEqual(
      findAddressDivergence('2A STONY PT RD', '2A-A Stony Point Road'),
      {
        visionStreet: '2A STONY PT RD',
        mlsStreet: '2A-A Stony Point Road',
        diverge: true,
      },
    )
  })
})
