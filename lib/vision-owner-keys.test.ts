import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractVisionOwnerKeys,
  pickUniqueOwnerPortfolios,
  visionOwnerClusterId,
  visionOwnerMailingKeyNorm,
  isIncompletePersonNameKey,
  visionOwnerNameKeyNorm,
  type VisionOwnerPortfolio,
} from './vision-owner-keys'

describe('visionOwnerNameKeyNorm', () => {
  it('collapses Last First and First Last to the same person', () => {
    assert.equal(visionOwnerNameKeyNorm('CASTILLO EDWARD'), 'castillo|edward')
    assert.equal(visionOwnerNameKeyNorm('EDWARD CASTILLO'), 'castillo|edward')
    assert.equal(visionOwnerNameKeyNorm('PENNA DENISE'), 'denise|penna')
    assert.equal(visionOwnerNameKeyNorm('Denise Penna'), 'denise|penna')
  })

  it('does not scramble an LLC', () => {
    assert.equal(visionOwnerNameKeyNorm('ACME HOLDINGS LLC'), 'acme|holdings|llc')
  })

  it('does not treat a first name alone as a landlord key', () => {
    assert.equal(visionOwnerNameKeyNorm('Adrianne'), '')
    assert.equal(visionOwnerNameKeyNorm('ADRIANNE'), '')
    assert.equal(visionOwnerNameKeyNorm('Pamela'), '')
    assert.equal(visionOwnerNameKeyNorm('A ELIZABETH'), '')
    assert.equal(visionOwnerNameKeyNorm('ANN LOU'), '')
    assert.equal(visionOwnerNameKeyNorm('MARY ELIZABETH'), '')
  })

  it('still keys a real last name plus given name', () => {
    assert.equal(visionOwnerNameKeyNorm('PENNA DENISE'), 'denise|penna')
    assert.equal(visionOwnerNameKeyNorm('KING AL W III'), 'al|iii|king|w')
    assert.ok(!isIncompletePersonNameKey('denise|penna'))
    assert.ok(!isIncompletePersonNameKey('al|iii|king|w'))
    assert.ok(isIncompletePersonNameKey('pamela'))
    assert.ok(isIncompletePersonNameKey('a|elizabeth'))
    assert.ok(isIncompletePersonNameKey('ann|lou'))
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
        'name:cameron|snyder',
        'name:cameron|synder',
      ],
    )
    assert.equal(
      visionOwnerClusterId('name', 'castillo|edward'),
      'name:castillo|edward',
    )
  })

  it('inherits the shared last name so Adrianne is not a first-name cluster', () => {
    const keys = extractVisionOwnerKeys({
      town: 'Westport',
      ownerName: 'THARP CHARLES & ADRIANNE',
    })
    const names = keys
      .filter((row) => row.keyKind === 'name')
      .map((row) => row.keyNorm)
      .sort()
    assert.deepEqual(names, ['adrianne|tharp', 'charles|tharp'])
    assert.ok(!names.includes('adrianne'))
  })

  it('keys Denise from a later quitclaim even when she is not of record', () => {
    const occupied = extractVisionOwnerKeys({
      town: 'Westport',
      ownerName: 'SMITH JOHN',
      ownership: [
        {
          owner: 'SMITH JOHN',
          date: '06/01/2020',
          price: '$0',
          bookPage: '1/1',
          qualified: 'U',
          instrument: '29',
        },
        {
          owner: 'PENNA DENISE',
          date: '03/15/2012',
          price: '$850,000',
          bookPage: '2/2',
          qualified: 'Q',
          instrument: '00',
        },
      ],
    })
    const secondHome = extractVisionOwnerKeys({
      town: 'Westport',
      ownerName: 'DENISE PENNA AND PENNA MARK',
      ownership: [
        {
          owner: 'DENISE PENNA AND PENNA MARK',
          date: '08/01/2018',
          price: '$1,200,000',
          bookPage: '3/3',
          qualified: 'Q',
          instrument: '00',
        },
      ],
    })
    assert.ok(occupied.some((row) => row.keyNorm === 'denise|penna'))
    assert.ok(secondHome.some((row) => row.keyNorm === 'denise|penna'))
    assert.ok(occupied.some((row) => row.keyNorm === 'john|smith'))
  })
})

describe('pickUniqueOwnerPortfolios', () => {
  it('keeps the larger mailing cluster and drops a name overlap', () => {
    const mailing: VisionOwnerPortfolio = {
      clusterId: 'mailing:po box 88|westport',
      clusterKind: 'mailing',
      town: 'Westport',
      displayName: 'KING ALBERT',
      relationship: 'owner',
      mailingLabel: 'PO BOX 88',
      parcelCount: 3,
      parcels: [
        { town: 'Westport', visionPid: '1', siteAddress: '1 Main' },
        { town: 'Westport', visionPid: '2', siteAddress: '2 Main' },
        { town: 'Westport', visionPid: '3', siteAddress: '3 Main' },
      ],
    }
    const name: VisionOwnerPortfolio = {
      clusterId: 'name:king|albert',
      clusterKind: 'name',
      town: 'Westport',
      displayName: 'KING ALBERT',
      relationship: 'landlord',
      mailingLabel: null,
      parcelCount: 2,
      parcels: [
        { town: 'Westport', visionPid: '1', siteAddress: '1 Main' },
        { town: 'Westport', visionPid: '2', siteAddress: '2 Main' },
      ],
    }
    const picked = pickUniqueOwnerPortfolios([name, mailing])
    assert.equal(picked.length, 1)
    assert.equal(picked[0]?.clusterId, mailing.clusterId)
    assert.equal(picked[0]?.parcelCount, 3)
  })
})
