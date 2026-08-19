import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addressMatchKey,
  normalizePropertyAddress,
  streetSearchVariants,
} from './property-address'

describe('streetSearchVariants', () => {
  it('expands Ln / Rd so RETS can hit MLS Lane / Road', () => {
    const locust = streetSearchVariants('5 Locust Ln').map((v) => v.toLowerCase())
    assert.ok(locust.includes('5 locust ln'))
    assert.ok(locust.includes('5 locust lane'))

    const lowlyn = streetSearchVariants('4 Lowlyn Rd').map((v) => v.toLowerCase())
    assert.ok(lowlyn.includes('4 lowlyn rd'))
    assert.ok(lowlyn.includes('4 lowlyn road'))
  })

  it('keeps already-expanded MLS spellings plus the canon short form', () => {
    const variants = streetSearchVariants('5 Locust Lane').map((v) => v.toLowerCase())
    assert.ok(variants.includes('5 locust lane'))
    assert.ok(variants.includes('5 locust ln'))
  })
})

describe('addressMatchKey', () => {
  it('joins Vision Ln / Rd to MLS Lane / Road', () => {
    const visionLocust = addressMatchKey(
      normalizePropertyAddress('Westport', '5 Locust Ln', null),
    )
    const mlsLocust = addressMatchKey(
      normalizePropertyAddress('Westport', '5 Locust Lane', '06880'),
    )
    assert.equal(visionLocust, mlsLocust)

    const visionLowlyn = addressMatchKey(
      normalizePropertyAddress('Westport', '4 Lowlyn Rd', null),
    )
    const mlsLowlyn = addressMatchKey(
      normalizePropertyAddress('Westport', '4 Lowlyn Road', '06880'),
    )
    assert.equal(visionLowlyn, mlsLowlyn)
  })
})
