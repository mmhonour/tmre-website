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
  nextCellAction,
  coastalStripLabel,
  coastalStripMark,
  countSuggestedOverwrite,
  hasSouthWaterShore,
  suggestCoastalStrips,
  townCenterOwning,
} from './location-estimate-zip-grid-shared'
import { townCenterOwningAt } from './location-estimate-town-centers-shared'
import { TOWN_CENTERS } from './tmre-geo'

describe('town-center overlay', () => {
  it('uses a relocated and enlarged disk when placements are saved', () => {
    const moved = { lat: 41.12, lon: -73.28, radiusMiles: 0.75 }
    const { dots, rings } = townCenterOverlayShapes({ Fairfield: moved })
    const fairfield = dots.find((d) => d.label === 'Fairfield')
    assert.equal(fairfield?.lat, moved.lat)
    assert.equal(fairfield?.lon, moved.lon)
    assert.equal(rings.length, 7)
    assert.equal(townCenterOwningAt(41.12, -73.28, { Fairfield: moved }), 'Fairfield')
  })

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
    assert.equal(rings[0]?.label, '2 2nd strip')
  })

  it('numbers Coast through 4th as 1–4', () => {
    assert.equal(coastalStripMark(0), 1)
    assert.equal(coastalStripMark(1), 2)
    assert.equal(coastalStripMark(2), 3)
    assert.equal(coastalStripMark(3), 4)
  })

  it('labels each strip with its mark and name', () => {
    assert.equal(coastalStripLabel(0), '1 Coast')
    assert.equal(coastalStripLabel(3), '4 4th strip')
  })

  it('paints four strips north from the south-facing town edge', () => {
    const occupied = [
      { i: 10, j: 20 },
      { i: 10, j: 21 },
      { i: 10, j: 22 },
      { i: 10, j: 23 },
      { i: 10, j: 24 },
    ]
    const suggested = suggestCoastalStrips(occupied)
    assert.equal(suggested['10,20'], 0)
    assert.equal(suggested['10,21'], 1)
    assert.equal(suggested['10,22'], 2)
    assert.equal(suggested['10,23'], 3)
    assert.equal(suggested['10,24'], undefined)
  })

  it('does not treat an inland zip border as shore when the town set includes the south neighbor', () => {
    const town = [
      { i: 3, j: 8 },
      { i: 3, j: 9 },
    ]
    const inlandOnly = [{ i: 3, j: 9 }]
    const suggested = suggestCoastalStrips(town, inlandOnly)
    assert.deepEqual(suggested, {})
  })

  it('treats an open south edge as water and a landlocked block as not', () => {
    const shore = [
      { i: 4, j: 10 },
      { i: 4, j: 11 },
    ]
    const inland = [
      { i: 4, j: 20 },
      { i: 4, j: 21 },
      { i: 4, j: 22 },
    ]
    const neighborSouth = [{ i: 4, j: 19 }, ...inland]
    assert.equal(hasSouthWaterShore(shore, shore), true)
    assert.equal(hasSouthWaterShore(neighborSouth, inland), false)
  })

  it('counts painted cells the south-shore seed would overwrite', () => {
    const suggested = { '1,1': 0 as const, '1,2': 1 as const }
    assert.equal(countSuggestedOverwrite({}, suggested), 0)
    assert.equal(countSuggestedOverwrite({ '1,1': 0 }, suggested), 0)
    assert.equal(countSuggestedOverwrite({ '1,1': 2, '1,2': 1 }, suggested), 1)
  })

  it('toggles a painted square off when clicked with the same brush', () => {
    assert.equal(nextCellAction(0, 0), 'erase')
    assert.equal(nextCellAction(undefined, 0), 0)
    assert.equal(nextCellAction(1, 0), 0)
    assert.equal(nextCellAction(2, 'erase'), 'erase')
  })

  it('combines one town disk set with painted cells', () => {
    const { i, j } = lonLatToCell(41.05, -73.27)
    const shapes = locationEstimateOverlayShapes({ [cellKey(i, j)]: 0 })
    assert.equal(shapes.dots.filter((d) => d.label === 'Fairfield').length, 1)
    assert.ok(shapes.rings.some((r) => r.kind === 'town_center'))
    assert.ok(shapes.rings.some((r) => r.kind === 'coastal_strip'))
  })
})
