import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coastalStripWaterMultiplier,
  computeLocationPremium,
  LOCATION_PREMIUM_WATER_TIERS,
} from './listing-location-premium'
import {
  cellKey,
  coastalStripLabel,
  lonLatToCell,
} from './location-estimate-zip-grid-shared'

/** Inland enough that pin tiers usually do not fire; painting still should. */
const INLAND = { lat: 41.2, lon: -73.32 }

describe('computeLocationPremium painted strips', () => {
  it('maps Coast / 2nd / 3rd / 4th onto the existing water-tier multipliers', () => {
    assert.equal(coastalStripWaterMultiplier(0), 1 + LOCATION_PREMIUM_WATER_TIERS[0].boost)
    assert.equal(coastalStripWaterMultiplier(1), 1 + LOCATION_PREMIUM_WATER_TIERS[1].boost)
    assert.equal(coastalStripWaterMultiplier(2), 1 + LOCATION_PREMIUM_WATER_TIERS[2].boost)
    assert.equal(coastalStripWaterMultiplier(3), 1 + LOCATION_PREMIUM_WATER_TIERS[3].boost)
  })

  it('uses the painted strip instead of water-access pins', () => {
    const { i, j } = lonLatToCell(INLAND.lat, INLAND.lon)
    const cells = { [cellKey(i, j)]: 0 as const }
    const painted = computeLocationPremium(
      INLAND.lat,
      INLAND.lon,
      '06825',
      'Fairfield',
      { cells },
    )
    const unpainted = computeLocationPremium(
      INLAND.lat,
      INLAND.lon,
      '06825',
      'Fairfield',
    )
    assert.equal(painted.coastalStrip, 0)
    assert.equal(painted.waterMultiplier, coastalStripWaterMultiplier(0))
    assert.ok(painted.labels.includes(coastalStripLabel(0)))
    assert.equal(unpainted.coastalStrip, null)
    assert.notEqual(painted.waterMultiplier, unpainted.waterMultiplier)
  })

  it('falls back to pin tiers when the cell is unpainted', () => {
    const { i, j } = lonLatToCell(INLAND.lat, INLAND.lon)
    const other = { [cellKey(i + 4, j + 4)]: 0 as const }
    const result = computeLocationPremium(
      INLAND.lat,
      INLAND.lon,
      '06825',
      'Fairfield',
      { cells: other },
    )
    assert.equal(result.coastalStrip, null)
  })

  it('returns coastalStrip null when coordinates are missing', () => {
    const result = computeLocationPremium(null, null)
    assert.equal(result.coastalStrip, null)
    assert.equal(result.combinedMultiplier, 1)
  })
})
