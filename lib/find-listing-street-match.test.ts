import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collapsedListingStreet,
  findListingStreetQueries,
  findListingStreetsMatch,
} from './find-listing-street-match'

describe('collapsedListingStreet', () => {
  it('glues Sea Spray / Seaspray / Sea-Spray to the same name', () => {
    assert.deepEqual(collapsedListingStreet('16 Sea Spray Rd'), {
      house: '16',
      name: 'seaspray',
    })
    assert.deepEqual(collapsedListingStreet('16 Seaspray Road'), {
      house: '16',
      name: 'seaspray',
    })
    assert.deepEqual(collapsedListingStreet('16 Sea-Spray Rd'), {
      house: '16',
      name: 'seaspray',
    })
  })

  it('drops a unit token', () => {
    assert.equal(
      collapsedListingStreet('16 Sea Spray Rd Unit 2')?.name,
      'seaspray',
    )
  })
})

describe('findListingStreetsMatch', () => {
  it('matches 16 Sea Spray to the glued MLS spelling', () => {
    assert.equal(
      findListingStreetsMatch('16 Sea Spray Rd', '16 Seaspray Road'),
      true,
    )
  })

  it('still matches Ln / Lane', () => {
    assert.equal(findListingStreetsMatch('5 Locust Ln', '5 Locust Lane'), true)
  })

  it('does not treat 16 Sea Spray as 16 Sea Lane', () => {
    assert.equal(
      findListingStreetsMatch('16 Sea Spray Rd', '16 Sea Lane'),
      false,
    )
  })

  it('allows a one-letter slip on a long collapsed name', () => {
    assert.equal(
      findListingStreetsMatch('16 Sea Spray Rd', '16 Seaspry Rd'),
      true,
    )
  })

  it('does not match a different house number', () => {
    assert.equal(
      findListingStreetsMatch('16 Sea Spray Rd', '18 Seaspray Rd'),
      false,
    )
  })
})

describe('findListingStreetQueries', () => {
  it('searches the expanded spelling then the glued compound', () => {
    const queries = findListingStreetQueries('16 Sea Spray Rd').map((q) =>
      q.toLowerCase(),
    )
    assert.ok(queries.some((q) => q.includes('spray') && q.includes('road')))
    assert.ok(queries.includes('16 seaspray'))
  })
})
