import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  censusZctaFromGeographiesJson,
  ipPostalNeedsWifiRefine,
  zipFromRingsAtPoint,
} from './visitor-wifi-zip-shared'

function box(
  west: number,
  south: number,
  east: number,
  north: number,
): [number, number][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ]
}

describe('ipPostalNeedsWifiRefine', () => {
  it('refines unique Norwalk 06858 and empty IP postal', () => {
    assert.equal(ipPostalNeedsWifiRefine('06858'), true)
    assert.equal(ipPostalNeedsWifiRefine(null), true)
  })

  it('keeps TMRE residential ZIPs', () => {
    assert.equal(ipPostalNeedsWifiRefine('06880'), false)
    assert.equal(ipPostalNeedsWifiRefine('06853'), false)
  })
})

describe('zipFromRingsAtPoint', () => {
  it('returns the Westport ZCTA for a Saugatuck-ish point', () => {
    const rings = new Map([
      ['06854', [box(-73.45, 41.08, -73.40, 41.12)]],
      ['06880', [box(-73.40, 41.10, -73.32, 41.16)]],
    ])
    assert.equal(zipFromRingsAtPoint(41.122, -73.369, rings), '06880')
  })
})

describe('censusZctaFromGeographiesJson', () => {
  it('reads GEOID from a ZCTA geography block', () => {
    assert.equal(
      censusZctaFromGeographiesJson({
        result: {
          geographies: {
            'Census ZIP Code Tabulation Areas': [{ GEOID: '06880' }],
          },
        },
      }),
      '06880',
    )
  })
})
