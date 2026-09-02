import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { haversineMiles } from './geo-distance'
import {
  LAND_STRETCH_HALF_WIDTH_MILES,
  LAND_STRETCH_LENGTH_MILES,
  applyTownMedianToLandStretch,
  computeLandStretchInsight,
  emptyLandStretchInsight,
  inLandStretch,
  landStretchExplainsPremium,
  localEastNorth,
  medianNumber,
  streetNameKey,
  type StretchSale,
  type StretchSubject,
} from './listing-land-stretch'

/** Arbitrary origin — tests are about geometry, not a real listing. */
const ORIGIN = { lat: 41.14, lon: -73.26 }

function offsetPoint(
  origin: { lat: number; lon: number },
  eastMiles: number,
  northMiles: number,
): { lat: number; lon: number } {
  const latRad = (origin.lat * Math.PI) / 180
  return {
    lat: origin.lat + northMiles / 69.172,
    lon: origin.lon + eastMiles / (69.172 * Math.cos(latRad)),
  }
}

function isoDaysAgo(days: number, nowMs: number): string {
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('inLandStretch vs radius', () => {
  it('keeps a point along the axis and drops an inland point the same distance away', () => {
    const axis = { east: 1, north: 0 }
    const along = offsetPoint(ORIGIN, 0.1, 0)
    const inland = offsetPoint(ORIGIN, 0, 0.1)

    assert.equal(
      inLandStretch(ORIGIN.lat, ORIGIN.lon, along.lat, along.lon, axis),
      true,
    )
    assert.equal(
      inLandStretch(ORIGIN.lat, ORIGIN.lon, inland.lat, inland.lon, axis),
      false,
    )

    const alongMiles = haversineMiles(ORIGIN.lat, ORIGIN.lon, along.lat, along.lon)
    const inlandMiles = haversineMiles(ORIGIN.lat, ORIGIN.lon, inland.lat, inland.lon)
    assert.ok(alongMiles < LAND_STRETCH_LENGTH_MILES)
    assert.ok(inlandMiles < LAND_STRETCH_LENGTH_MILES)
    assert.ok(inlandMiles > LAND_STRETCH_HALF_WIDTH_MILES)
  })

  it('rejects a point past the 1/4-mile stretch even if a 1/4-mile radius would miss it the other way', () => {
    const axis = { east: 1, north: 0 }
    const pastEnd = offsetPoint(ORIGIN, 0.2, 0)
    assert.equal(
      inLandStretch(ORIGIN.lat, ORIGIN.lon, pastEnd.lat, pastEnd.lon, axis),
      false,
    )
  })
})

describe('localEastNorth', () => {
  it('round-trips a known east/north offset', () => {
    const p = offsetPoint(ORIGIN, 0.12, -0.04)
    const off = localEastNorth(ORIGIN.lat, ORIGIN.lon, p.lat, p.lon)
    assert.ok(Math.abs(off.east - 0.12) < 0.002)
    assert.ok(Math.abs(off.north + 0.04) < 0.002)
  })
})

describe('medianNumber / explains', () => {
  it('takes the middle of an odd set', () => {
    assert.equal(medianNumber([300, 100, 200]), 200)
  })

  it('attributes a listing premium to land when the stretch trades at a similar premium', () => {
    assert.equal(landStretchExplainsPremium(1440, 484, 1300, 5), true)
  })

  it('does not invent a land story when the stretch itself is near the town median', () => {
    assert.equal(landStretchExplainsPremium(1440, 484, 510, 5), false)
  })

  it('needs enough solds', () => {
    assert.equal(landStretchExplainsPremium(1440, 484, 1300, 2), false)
  })
})

describe('streetNameKey', () => {
  it('drops the house number and folds Rd / Road', () => {
    assert.equal(streetNameKey('50 Example Road'), streetNameKey('10 Example Rd'))
  })
})

describe('computeLandStretchInsight', () => {
  it('picks a street stretch from same-street solds for any subject', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    // Far from TMRE water/center points so only the street axis is available.
    const here = { lat: 41.55, lon: -73.85 }
    const subject: StretchSubject = {
      id: 's1',
      latitude: here.lat,
      longitude: here.lon,
      street: '50 Example Lane',
      beds: 3,
      baths: 2,
      sqft: 1400,
      pricePerSqft: 900,
    }

    const mk = (
      id: string,
      east: number,
      north: number,
      ppsf: number,
      street: string,
    ): StretchSale => {
      const pt = offsetPoint(here, east, north)
      return {
        id,
        latitude: pt.lat,
        longitude: pt.lon,
        pricePerSqft: ppsf,
        closeDate: isoDaysAgo(40, now),
        beds: 3,
        baths: 2,
        sqft: 1350,
        street,
      }
    }

    const sales = [
      mk('a', 0.08, 0.005, 880, '10 Example Ln'),
      mk('b', -0.06, -0.004, 910, '80 Example Lane'),
      mk('c', 0.04, 0.002, 870, '22 Example Ln'),
      mk('inland', 0.01, 0.12, 400, '9 Other Rd'),
    ]

    const insight = computeLandStretchInsight(subject, sales, 450, now)
    assert.equal(insight.axis, 'street')
    assert.ok(insight.soldCount >= 3)
    assert.equal(insight.explainsLandPremium, true)
    assert.ok((insight.stretchMedianPpsf ?? 0) > 800)
  })
})

describe('applyTownMedianToLandStretch', () => {
  it('applies the town median at read time without recomputing solds', () => {
    const stored = {
      ...emptyLandStretchInsight(900, null),
      axis: 'street' as const,
      soldCount: 4,
      stretchMedianPpsf: 880,
    }
    const applied = applyTownMedianToLandStretch(stored, 450, 900)
    assert.equal(applied.explainsLandPremium, true)
    assert.ok((applied.stretchPremiumPct ?? 0) > 0.5)
    assert.equal(applied.stretchMedianPpsf, 880)
  })
})
