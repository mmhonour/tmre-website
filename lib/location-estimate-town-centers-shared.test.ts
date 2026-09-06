import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampTownCenterRadius,
  parseTownCentersPayload,
  resolveTownCenter,
  townCenterOwningAt,
} from './location-estimate-town-centers-shared'
import { TOWN_CENTERS } from './tmre-geo'

describe('location-estimate-town-centers-shared', () => {
  it('clamps radius between 0.10 and 2.00 miles', () => {
    assert.equal(clampTownCenterRadius(0.01), 0.1)
    assert.equal(clampTownCenterRadius(3), 2)
    assert.equal(clampTownCenterRadius(0.37), 0.35)
  })

  it('falls back to the hardcoded Fairfield point', () => {
    const pt = resolveTownCenter('Fairfield')
    assert.equal(pt.lat, TOWN_CENTERS.Fairfield.lat)
    assert.equal(pt.lon, TOWN_CENTERS.Fairfield.lon)
    assert.equal(pt.radiusMiles, 0.25)
  })

  it('lets a larger disk own a point the default radius misses', () => {
    const far = { lat: 41.1408 + 0.01, lon: -73.2637 }
    assert.equal(townCenterOwningAt(far.lat, far.lon), null)
    assert.equal(
      townCenterOwningAt(far.lat, far.lon, {
        Fairfield: { lat: 41.1408, lon: -73.2637, radiusMiles: 1 },
      }),
      'Fairfield',
    )
  })

  it('parses saved placements and ignores unknown towns', () => {
    const parsed = parseTownCentersPayload(
      JSON.stringify({
        placements: {
          Fairfield: { lat: 41.13, lon: -73.27, radiusMiles: 0.5 },
          Nowhere: { lat: 41.1, lon: -73.2, radiusMiles: 1 },
        },
      }),
    )
    assert.equal(parsed.placements.Fairfield?.radiusMiles, 0.5)
    assert.equal(parsed.placements.Fairfield?.lat, 41.13)
    assert.equal(
      (parsed.placements as { Nowhere?: unknown }).Nowhere,
      undefined,
    )
  })
})
