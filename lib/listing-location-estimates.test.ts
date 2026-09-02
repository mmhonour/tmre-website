import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { haversineMiles } from './geo-distance'
import {
  COASTAL_STRIP_VALUE_FACTOR,
  LOCATION_CORRIDOR_HALF_WIDTH_MILES,
  LOCATION_CORRIDOR_LENGTH_MILES,
  TOWN_CENTER_RADIUS_MILES,
  applyTownMedianToLocationEstimate,
  coastalStripIndex,
  coastalStripRelativeValue,
  computeLocationEstimate,
  emptyLocationEstimate,
  inCoastalStrip,
  inLocationCorridor,
  inTownCenterRadius,
  inlandMilesFromWaterLine,
  locationEstimateExplains,
  localEastNorth,
  medianNumber,
  perpendicularAxis,
  streetNameKey,
  type EstimateSale,
  type EstimateSubject,
} from './listing-location-estimates'
import { WATER_ACCESS_POINTS, ZIP_CENTERS } from './tmre-geo'

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

function saleAt(
  id: string,
  origin: { lat: number; lon: number },
  east: number,
  north: number,
  ppsf: number,
  now: number,
  street = '9 Other Rd',
): EstimateSale {
  const pt = offsetPoint(origin, east, north)
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

describe('inLocationCorridor vs radius', () => {
  it('keeps a point along the axis and drops an inland point the same distance away', () => {
    const axis = { east: 1, north: 0 }
    const along = offsetPoint(ORIGIN, 0.1, 0)
    const inland = offsetPoint(ORIGIN, 0, 0.1)

    assert.equal(
      inLocationCorridor(ORIGIN.lat, ORIGIN.lon, along.lat, along.lon, axis),
      true,
    )
    assert.equal(
      inLocationCorridor(ORIGIN.lat, ORIGIN.lon, inland.lat, inland.lon, axis),
      false,
    )

    const alongMiles = haversineMiles(ORIGIN.lat, ORIGIN.lon, along.lat, along.lon)
    const inlandMiles = haversineMiles(ORIGIN.lat, ORIGIN.lon, inland.lat, inland.lon)
    assert.ok(alongMiles < LOCATION_CORRIDOR_LENGTH_MILES)
    assert.ok(inlandMiles < LOCATION_CORRIDOR_LENGTH_MILES)
    assert.ok(inlandMiles > LOCATION_CORRIDOR_HALF_WIDTH_MILES)
  })

  it('rejects a point past the 1/4-mile stretch even if a 1/4-mile radius would miss it the other way', () => {
    const axis = { east: 1, north: 0 }
    const pastEnd = offsetPoint(ORIGIN, 0.2, 0)
    assert.equal(
      inLocationCorridor(ORIGIN.lat, ORIGIN.lon, pastEnd.lat, pastEnd.lon, axis),
      false,
    )
  })
})

describe('inTownCenterRadius', () => {
  it('keeps every direction inside 1/4 mile and drops a point just outside', () => {
    const insideAlong = offsetPoint(ORIGIN, 0.15, 0)
    const insideAcross = offsetPoint(ORIGIN, 0, 0.15)
    const outside = offsetPoint(ORIGIN, 0.3, 0)

    assert.equal(
      inTownCenterRadius(ORIGIN.lat, ORIGIN.lon, insideAlong.lat, insideAlong.lon),
      true,
    )
    assert.equal(
      inTownCenterRadius(ORIGIN.lat, ORIGIN.lon, insideAcross.lat, insideAcross.lon),
      true,
    )
    assert.equal(
      inTownCenterRadius(ORIGIN.lat, ORIGIN.lon, outside.lat, outside.lon),
      false,
    )
    assert.ok(TOWN_CENTER_RADIUS_MILES === 0.25)
  })
})

describe('coastal strips', () => {
  it('indexes 1/4-mile inland bands and steps value down 25% each strip', () => {
    assert.equal(coastalStripIndex(0.05), 0)
    assert.equal(coastalStripIndex(0.24), 0)
    assert.equal(coastalStripIndex(0.26), 1)
    assert.equal(coastalStripIndex(0.74), 2)
    assert.equal(coastalStripIndex(0.9), 3)
    assert.equal(coastalStripIndex(1.01), null)
    assert.equal(coastalStripRelativeValue(0), 1)
    assert.equal(coastalStripRelativeValue(1), COASTAL_STRIP_VALUE_FACTOR)
    assert.equal(coastalStripRelativeValue(2), COASTAL_STRIP_VALUE_FACTOR ** 2)
    assert.ok(Math.abs(coastalStripRelativeValue(1) - 0.75) < 1e-9)
  })

  it('keeps a same-strip shore sale and drops the next inland strip', () => {
    const water = { lat: 41.135, lon: -73.275 }
    const towardWater = { east: 0, north: -1 }
    const shore = perpendicularAxis(towardWater)
    const subject = offsetPoint(water, 0, 0.08)
    const sameStrip = offsetPoint(water, 0.08, 0.08)
    const nextStrip = offsetPoint(water, 0.04, 0.4)

    assert.equal(coastalStripIndex(inlandMilesFromWaterLine(
      water.lat, water.lon, towardWater, subject.lat, subject.lon,
    )), 0)
    assert.equal(
      inCoastalStrip(
        water, towardWater, shore,
        subject.lat, subject.lon, sameStrip.lat, sameStrip.lon, 0,
      ),
      true,
    )
    assert.equal(
      inCoastalStrip(
        water, towardWater, shore,
        subject.lat, subject.lon, nextStrip.lat, nextStrip.lon, 0,
      ),
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
    assert.equal(locationEstimateExplains(1440, 484, 1300, 5), true)
  })

  it('does not invent a land story when the stretch itself is near the town median', () => {
    assert.equal(locationEstimateExplains(1440, 484, 510, 5), false)
  })

  it('needs enough solds', () => {
    assert.equal(locationEstimateExplains(1440, 484, 1300, 2), false)
  })
})

describe('streetNameKey', () => {
  it('drops the house number and folds Rd / Road', () => {
    assert.equal(streetNameKey('50 Example Road'), streetNameKey('10 Example Rd'))
  })
})

describe('computeLocationEstimate', () => {
  it('picks a street stretch from same-street solds for any subject', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    // Far from TMRE water/center points so only the street axis is available.
    const here = { lat: 41.55, lon: -73.85 }
    const subject: EstimateSubject = {
      id: 's1',
      latitude: here.lat,
      longitude: here.lon,
      street: '50 Example Lane',
      beds: 3,
      baths: 2,
      sqft: 1400,
      pricePerSqft: 900,
    }

    const sales = [
      saleAt('a', here, 0.08, 0.005, 880, now, '10 Example Ln'),
      saleAt('b', here, -0.06, -0.004, 910, now, '80 Example Lane'),
      saleAt('c', here, 0.04, 0.002, 870, now, '22 Example Ln'),
      saleAt('inland', here, 0.01, 0.12, 400, now, '9 Other Rd'),
    ]

    const insight = computeLocationEstimate(subject, sales, 450, now)
    assert.equal(insight.kind, 'street')
    assert.equal(insight.geometry, 'corridor')
    assert.ok(insight.soldCount >= 3)
    assert.equal(insight.explainsLocation, true)
    assert.ok((insight.soldMedianPpsf ?? 0) > 800)
  })

  it('uses a 1/4-mile disk around the town center, not a corridor', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    const center = ZIP_CENTERS['06824']!
    const here = offsetPoint(center, 0.04, 0)
    const subject: EstimateSubject = {
      id: 'downtown',
      latitude: here.lat,
      longitude: here.lon,
      postalCode: '06824',
      street: '10 Center St',
      beds: 3,
      baths: 2,
      sqft: 1400,
      pricePerSqft: 900,
    }

    // Off the subject→center axis (east/west) so a corridor would drop them,
    // but still inside the village disk.
    const sales = [
      saleAt('n1', center, 0.02, 0.12, 880, now),
      saleAt('s1', center, -0.03, -0.1, 910, now),
      saleAt('n2', center, 0.01, 0.08, 870, now),
      saleAt('far', center, 0.4, 0, 400, now),
    ]

    const insight = computeLocationEstimate(subject, sales, 450, now)
    assert.equal(insight.kind, 'town_center')
    assert.equal(insight.geometry, 'radius')
    assert.ok(insight.soldCount >= 3)
    assert.equal(insight.explainsLocation, true)
    assert.ok((insight.soldMedianPpsf ?? 0) > 800)
  })

  it('matches coastal solds in the same shore-parallel strip and ignores the next inland strip', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    const water = WATER_ACCESS_POINTS.find(
      (p) => Math.abs(p.lat - 41.135) < 0.001 && Math.abs(p.lon + 73.275) < 0.001,
    )!
    const subjectPt = offsetPoint(water, 0, 0.08)
    const subject: EstimateSubject = {
      id: 'coast',
      latitude: subjectPt.lat,
      longitude: subjectPt.lon,
      postalCode: '06824',
      street: '20 Shore Rd',
      beds: 3,
      baths: 2,
      sqft: 1400,
      pricePerSqft: 1400,
    }

    const sameA = offsetPoint(water, 0.07, 0.07)
    const sameB = offsetPoint(water, -0.06, 0.09)
    const sameC = offsetPoint(water, 0.04, 0.1)
    const inlandStrip = offsetPoint(water, 0.02, 0.4)

    const sales: EstimateSale[] = [
      {
        id: 'c1',
        latitude: sameA.lat,
        longitude: sameA.lon,
        pricePerSqft: 1380,
        closeDate: isoDaysAgo(30, now),
        beds: 3,
        baths: 2,
        sqft: 1300,
        street: '10 Shore Rd',
      },
      {
        id: 'c2',
        latitude: sameB.lat,
        longitude: sameB.lon,
        pricePerSqft: 1420,
        closeDate: isoDaysAgo(20, now),
        beds: 3,
        baths: 2,
        sqft: 1320,
        street: '30 Shore Rd',
      },
      {
        id: 'c3',
        latitude: sameC.lat,
        longitude: sameC.lon,
        pricePerSqft: 1360,
        closeDate: isoDaysAgo(45, now),
        beds: 3,
        baths: 2,
        sqft: 1280,
        street: '40 Shore Rd',
      },
      {
        id: 'inland',
        latitude: inlandStrip.lat,
        longitude: inlandStrip.lon,
        pricePerSqft: 500,
        closeDate: isoDaysAgo(15, now),
        beds: 3,
        baths: 2,
        sqft: 1400,
        street: '8 Inland Rd',
      },
    ]

    const insight = computeLocationEstimate(subject, sales, 484, now)
    assert.equal(insight.kind, 'coastal')
    assert.equal(insight.geometry, 'strip')
    assert.equal(insight.coastalStrip?.index, 0)
    assert.equal(insight.coastalStrip?.relativeValue, 1)
    assert.ok(insight.soldCount >= 3)
    assert.ok((insight.soldMedianPpsf ?? 0) > 1300)
  })

  it('does not let a waterfront strip leak into the next inland strip', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z')
    const water = { lat: 41.135, lon: -73.275 }
    const subjectPt = offsetPoint(water, 0, 0.38)
    const subject: EstimateSubject = {
      id: 'second-strip',
      latitude: subjectPt.lat,
      longitude: subjectPt.lon,
      postalCode: '06824',
      street: '50 Inland Shore',
      beds: 3,
      baths: 2,
      sqft: 1400,
      pricePerSqft: 1050,
    }

    const strip1 = [
      saleAt('i1', water, 0.06, 0.36, 1040, now, '40 Inland Shore'),
      saleAt('i2', water, -0.05, 0.4, 1080, now, '60 Inland Shore'),
      saleAt('i3', water, 0.03, 0.42, 1020, now, '70 Inland Shore'),
    ]
    const waterfront = [
      saleAt('w1', water, 0.05, 0.08, 1600, now, '10 Shore Rd'),
      saleAt('w2', water, -0.04, 0.09, 1550, now, '20 Shore Rd'),
      saleAt('w3', water, 0.02, 0.06, 1580, now, '30 Shore Rd'),
    ]

    const insight = computeLocationEstimate(
      subject,
      [...strip1, ...waterfront],
      484,
      now,
    )
    assert.equal(insight.kind, 'coastal')
    assert.equal(insight.coastalStrip?.index, 1)
    assert.ok(Math.abs((insight.coastalStrip?.relativeValue ?? 0) - 0.75) < 1e-9)
    assert.ok((insight.soldMedianPpsf ?? 0) < 1200)
    assert.ok((insight.soldMedianPpsf ?? 0) > 1000)
  })
})

describe('applyTownMedianToLocationEstimate', () => {
  it('applies the town median at read time without recomputing solds', () => {
    const stored = {
      ...emptyLocationEstimate(900, null),
      kind: 'street' as const,
      axis: 'street' as const,
      geometry: 'corridor' as const,
      soldCount: 4,
      soldMedianPpsf: 880,
    }
    const applied = applyTownMedianToLocationEstimate(stored, 450, 900)
    assert.equal(applied.explainsLocation, true)
    assert.ok((applied.soldPremiumPct ?? 0) > 0.5)
    assert.equal(applied.soldMedianPpsf, 880)
    assert.equal(applied.geometry, 'corridor')
  })
})
