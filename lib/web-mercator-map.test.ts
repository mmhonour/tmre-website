import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fitMapBounds,
  latToWorldY,
  lonToWorldX,
  screenToLonLat,
  worldToLonLat,
} from './web-mercator-map'

describe('web-mercator-map', () => {
  it('round-trips Fairfield through world pixels', () => {
    const lat = 41.1408
    const lon = -73.2637
    const zoom = 12
    const x = lonToWorldX(lon, zoom)
    const y = latToWorldY(lat, zoom)
    const back = worldToLonLat(x, y, zoom)
    assert.ok(Math.abs(back.lat - lat) < 0.0001)
    assert.ok(Math.abs(back.lon - lon) < 0.0001)
  })

  it('fits a town box inside the panel', () => {
    const { zoom } = fitMapBounds(
      { minLat: 41.1, maxLat: 41.2, minLon: -73.35, maxLon: -73.2 },
      720,
      520,
    )
    assert.ok(zoom >= 9)
    assert.ok(zoom <= 17)
  })

  it('reads the lon/lat under the panel centre', () => {
    const center = { lat: 41.141, lon: -73.358 }
    const pt = screenToLonLat(360, 260, center, 12, { width: 720, height: 520 })
    assert.ok(Math.abs(pt.lat - center.lat) < 0.0001)
    assert.ok(Math.abs(pt.lon - center.lon) < 0.0001)
  })
})
