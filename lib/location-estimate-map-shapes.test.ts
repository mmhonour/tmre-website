import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  locationEstimateOverlayShapes,
  paintedGridOverlayRings,
  townCenterOverlayShapes,
} from './location-estimate-map-shapes'
import {
  TOWN_CENTER_RADIUS_MILES,
  cellCenter,
  cellKey,
  lonLatToCell,
  milesBetween,
  townCenterOwning,
} from './location-estimate-zip-grid-shared'
import { TOWN_CENTERS } from './tmre-geo'

describe('town-center overlay', () => {
  it('draws one disk per TMRE town, not one per zip', () => {
    const { rings, dots } = townCenterOverlayShapes()
    assert.equal(rings.length, 7)
    assert.equal(dots.length, 7)
    assert.ok(dots.some((d) => d.label === 'Fairfield'))
    assert.ok(!dots.some((d) => /^\d{5}$/.test(d.label)))
  })
})

describe('zip grid', () => {
  it('round-trips a lat/lon into a cell and back near the same point', () => {
    const lat = 41.141
    const lon = -73.264
    const { i, j } = lonLatToCell(lat, lon)
    const c = cellCenter(i, j)
    assert.ok(milesBetween({ lat, lon }, c) < 0.2)
    assert.equal(cellKey(i, j), `${i},${j}`)
  })

  it('treats the Fairfield town point as inside its own radius', () => {
    const pt = TOWN_CENTERS.Fairfield
    assert.equal(townCenterOwning(pt.lat, pt.lon), 'Fairfield')
    assert.ok(TOWN_CENTER_RADIUS_MILES === 0.25)
  })

  it('drops painted cells that sit inside the town-center disk', () => {
    const pt = TOWN_CENTERS.Fairfield
    const { i, j } = lonLatToCell(pt.lat, pt.lon)
    const rings = paintedGridOverlayRings({ [cellKey(i, j)]: 0 })
    assert.equal(rings.length, 0)
  })

  it('keeps a far-away painted cell', () => {
    const { i, j } = lonLatToCell(41.05, -73.27)
    assert.equal(townCenterOwning(41.05, -73.27), null)
    const rings = paintedGridOverlayRings({ [cellKey(i, j)]: 1 })
    assert.equal(rings.length, 1)
    assert.equal(rings[0]?.stripIndex, 1)
  })

  it('combines one town disk set with painted cells', () => {
    const { i, j } = lonLatToCell(41.05, -73.27)
    const shapes = locationEstimateOverlayShapes({ [cellKey(i, j)]: 0 })
    assert.equal(shapes.dots.filter((d) => d.label === 'Fairfield').length, 1)
    assert.ok(shapes.rings.some((r) => r.kind === 'town_center'))
    assert.ok(shapes.rings.some((r) => r.kind === 'coastal_strip'))
  })
})
