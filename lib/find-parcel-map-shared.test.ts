import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aroundFocusBounds,
  classifyFindParcelRelation,
  criteriaFromParcelFacts,
  neighborMatchesAroundFilter,
  radiusBounds,
  sameStreetName,
  streetNameKey,
  type FindParcelMapNeighbor,
} from './find-parcel-map-shared'

describe('streetNameKey', () => {
  it('drops the house number', () => {
    assert.equal(streetNameKey('12 Main St'), 'main st')
    assert.equal(streetNameKey('2A STONY PT RD'), 'stony pt rd')
  })
})

describe('sameStreetName', () => {
  it('matches neighbors on the same street', () => {
    assert.equal(sameStreetName('12 Main St', '40 Main Street'), true)
    assert.equal(sameStreetName('12 Main St', '12 Compo Rd'), false)
  })
})

describe('classifyFindParcelRelation', () => {
  it('prefers same street over radius', () => {
    assert.equal(
      classifyFindParcelRelation('12 Main St', '80 Main St', 0.9),
      'same_street',
    )
  })

  it('tags a different street inside the radius as cross street', () => {
    assert.equal(
      classifyFindParcelRelation('12 Main St', '4 Compo Rd', 0.2),
      'cross_street',
    )
  })

  it('drops homes outside the radius on another street', () => {
    assert.equal(
      classifyFindParcelRelation('12 Main St', '4 Compo Rd', 0.9),
      null,
    )
  })
})

describe('neighborMatchesAroundFilter', () => {
  it('radius includes same-street homes inside the ring', () => {
    assert.equal(
      neighborMatchesAroundFilter(
        { relation: 'same_street', miles: 0.1 },
        'radius',
      ),
      true,
    )
    assert.equal(
      neighborMatchesAroundFilter(
        { relation: 'same_street', miles: 0.9 },
        'radius',
      ),
      false,
    )
  })
})

function testNeighbor(
  relation: FindParcelMapNeighbor['relation'],
  lat: number,
  lon: number,
): FindParcelMapNeighbor {
  return {
    relation,
    miles: 0.1,
    zip: '06880',
    vintageLabel: '1941–1970',
    yearBuilt: 1965,
    furnished: null,
    href: '/listings/x',
    pin: {
      key: `${relation}-${lat}`,
      address: 'x',
      price: 1,
      score: 0,
      isRental: false,
      sqft: 1,
      latitude: lat,
      longitude: lon,
    },
  }
}

describe('aroundFocusBounds', () => {
  const subject = { latitude: 41.141, longitude: -73.358 }
  const neighbors = [
    testNeighbor('same_street', 41.143, -73.356),
    testNeighbor('cross_street', 41.136, -73.365),
  ]

  it('frames the 0.35 mi radius around the house', () => {
    const box = aroundFocusBounds('radius', subject, neighbors, 0.35)
    const expected = radiusBounds({ lat: 41.141, lon: -73.358 }, 0.35)
    assert.deepEqual(box, expected)
  })

  it('same street stays tighter than street plus crossings', () => {
    const street = aroundFocusBounds('same_street', subject, neighbors)
    const cross = aroundFocusBounds('cross_street', subject, neighbors)
    assert.ok(street)
    assert.ok(cross)
    const streetSpan = street.maxLat - street.minLat
    const crossSpan = cross.maxLat - cross.minLat
    assert.ok(crossSpan > streetSpan)
    assert.ok(street.maxLat > 41.143)
    assert.ok(street.minLat < 41.141)
    assert.ok(cross.minLat < 41.136)
  })
})

describe('criteriaFromParcelFacts', () => {
  it('needs beds and baths', () => {
    const missing = criteriaFromParcelFacts({ zip: '06880', sqft: 2000 })
    assert.equal(missing.criteria, null)
    assert.deepEqual(missing.missingCriteria, ['bedrooms', 'bathrooms'])
  })

  it('builds like-kind criteria from Vision facts', () => {
    const built = criteriaFromParcelFacts({
      zip: '06880',
      beds: 4,
      baths: 3,
      sqft: 2800,
      yearBuilt: 1968,
    })
    assert.equal(built.criteria?.beds, 4)
    assert.equal(built.criteria?.vintageLabel, '1941–1970')
  })
})
