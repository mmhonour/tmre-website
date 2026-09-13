import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyFindParcelRelation,
  criteriaFromParcelFacts,
  neighborMatchesAroundFilter,
  sameStreetName,
  streetNameKey,
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
