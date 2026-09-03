import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  COASTAL_INLAND_MAX_MILES,
  COASTAL_STRIP_WIDTH_MILES,
  TOWN_CENTER_RADIUS_MILES,
} from './listing-location-estimates'
import { locationEstimateOverlayShapes } from './location-estimate-map-shapes'
import { WATER_ACCESS_POINTS } from './tmre-geo'

describe('locationEstimateOverlayShapes', () => {
  it('draws a 1/4-mile disk for each unique town / zip center', () => {
    const { rings, dots } = locationEstimateOverlayShapes()
    const centers = rings.filter((r) => r.kind === 'town_center')
    assert.ok(centers.length >= 7)
    assert.equal(dots.length, centers.length)

    const sample = centers[0]!
    const [lon0, lat0] = sample.ring[0]!
    const mid = sample.ring[Math.floor(sample.ring.length / 4)]!
    const dLat = (mid[1] - lat0) * 69.172
    const dLon =
      (mid[0] - lon0) * Math.cos((lat0 * Math.PI) / 180) * 69.172
    const chord = Math.hypot(dLat, dLon)
    // Quarter-circle chord of a 0.25 mi radius is about 0.35 mi.
    assert.ok(chord > TOWN_CENTER_RADIUS_MILES * 0.8)
    assert.ok(chord < TOWN_CENTER_RADIUS_MILES * 2)
  })

  it('stacks four shore-parallel strips at each water point out to 1 mile', () => {
    const { rings } = locationEstimateOverlayShapes()
    const strips = rings.filter((r) => r.kind === 'coastal_strip')
    const expected =
      WATER_ACCESS_POINTS.length *
      Math.round(COASTAL_INLAND_MAX_MILES / COASTAL_STRIP_WIDTH_MILES)
    assert.equal(strips.length, expected)
    const indexes = new Set(strips.map((s) => s.stripIndex))
    assert.deepEqual([...indexes].sort((a, b) => (a ?? 0) - (b ?? 0)), [0, 1, 2, 3])
  })
})
