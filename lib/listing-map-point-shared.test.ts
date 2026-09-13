import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  censusGeocodeCoordinates,
  listingDisplayMapPoint,
  listingMapPointCacheKey,
  listingStreetLine,
  pointInTownRings,
  resolveListingMapPointFromParts,
} from './listing-map-point-shared'

/** Closed lon/lat box used as a stand-in for a town zip outline. */
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

/** Westport-ish box: Coleytown is inside; the MLS pin north of it is not. */
const WESTPORT_RINGS = [box(-73.4, 41.1, -73.3, 41.185)]

const MLS_OUTSIDE = { latitude: 41.1872, longitude: -73.35692 }
const GEOCODE_INSIDE = { latitude: 41.179353, longitude: -73.358066 }
const MLS_INSIDE = { latitude: 41.141, longitude: -73.358 }

describe('pointInTownRings', () => {
  it('keeps Coleytown and drops the Weston stretch of Lyons Plain', () => {
    assert.equal(
      pointInTownRings(GEOCODE_INSIDE.latitude, GEOCODE_INSIDE.longitude, WESTPORT_RINGS),
      true,
    )
    assert.equal(
      pointInTownRings(MLS_OUTSIDE.latitude, MLS_OUTSIDE.longitude, WESTPORT_RINGS),
      false,
    )
  })

  it('is false when there are no rings', () => {
    assert.equal(pointInTownRings(41.14, -73.35, []), false)
  })
})

describe('resolveListingMapPointFromParts', () => {
  it('keeps MLS when the pin is already inside the town', () => {
    const point = resolveListingMapPointFromParts({
      mls: MLS_INSIDE,
      geocode: GEOCODE_INSIDE,
      townRings: WESTPORT_RINGS,
    })
    assert.deepEqual(point, { ...MLS_INSIDE, source: 'mls' })
  })

  it('replaces MLS with the street geocode when MLS sits outside the town', () => {
    const point = resolveListingMapPointFromParts({
      mls: MLS_OUTSIDE,
      geocode: GEOCODE_INSIDE,
      townRings: WESTPORT_RINGS,
    })
    assert.deepEqual(point, { ...GEOCODE_INSIDE, source: 'address-geocode' })
  })

  it('keeps MLS when the geocode is also outside the town', () => {
    const point = resolveListingMapPointFromParts({
      mls: MLS_OUTSIDE,
      geocode: { latitude: 41.2, longitude: -73.35 },
      townRings: WESTPORT_RINGS,
    })
    assert.deepEqual(point, { ...MLS_OUTSIDE, source: 'mls' })
  })

  it('keeps MLS when geocode is missing', () => {
    const point = resolveListingMapPointFromParts({
      mls: MLS_OUTSIDE,
      geocode: null,
      townRings: WESTPORT_RINGS,
    })
    assert.deepEqual(point, { ...MLS_OUTSIDE, source: 'mls' })
  })

  it('uses MLS when town rings are unavailable', () => {
    const point = resolveListingMapPointFromParts({
      mls: MLS_OUTSIDE,
      geocode: GEOCODE_INSIDE,
      townRings: [],
    })
    assert.deepEqual(point, { ...MLS_OUTSIDE, source: 'mls' })
  })

  it('uses a geocode when MLS coords are missing', () => {
    const point = resolveListingMapPointFromParts({
      mls: { latitude: null, longitude: null },
      geocode: GEOCODE_INSIDE,
      townRings: WESTPORT_RINGS,
    })
    assert.deepEqual(point, { ...GEOCODE_INSIDE, source: 'address-geocode' })
  })

  it('returns null when nothing plottable is in-town', () => {
    const point = resolveListingMapPointFromParts({
      mls: { latitude: null, longitude: null },
      geocode: null,
      townRings: WESTPORT_RINGS,
    })
    assert.equal(point, null)
  })
})

describe('censusGeocodeCoordinates', () => {
  it('reads Census x/y as lon/lat', () => {
    assert.deepEqual(
      censusGeocodeCoordinates({
        result: {
          addressMatches: [
            { coordinates: { x: -73.358066, y: 41.179353 } },
          ],
        },
      }),
      GEOCODE_INSIDE,
    )
  })

  it('returns null for an empty match list', () => {
    assert.equal(
      censusGeocodeCoordinates({ result: { addressMatches: [] } }),
      null,
    )
  })
})

describe('listingDisplayMapPoint', () => {
  it('prefers chrome mapPoint over stored MLS', () => {
    assert.deepEqual(
      listingDisplayMapPoint(MLS_OUTSIDE, {
        ...GEOCODE_INSIDE,
        source: 'address-geocode',
      }),
      GEOCODE_INSIDE,
    )
  })

  it('falls back to listing coords when mapPoint is absent', () => {
    assert.deepEqual(listingDisplayMapPoint(MLS_OUTSIDE, null), MLS_OUTSIDE)
  })
})

describe('listingStreetLine', () => {
  it('uses street, then the first line of full', () => {
    assert.equal(
      listingStreetLine({ street: '36 Lyons Plain Rd', full: '36 Lyons Plain Rd, Westport' }),
      '36 Lyons Plain Rd',
    )
    assert.equal(
      listingStreetLine({ street: '', full: '36 Lyons Plain Rd, Westport, CT' }),
      '36 Lyons Plain Rd',
    )
  })
})

describe('listingMapPointCacheKey', () => {
  it('includes address and MLS coords', () => {
    const key = listingMapPointCacheKey({
      ...MLS_OUTSIDE,
      address: {
        street: '36 Lyons Plain Rd',
        city: 'Westport',
        state: 'CT',
        postalCode: '06880',
      },
    })
    assert.match(key, /36 Lyons Plain Rd\|Westport\|CT\|06880\|41\.1872\|-73\.35692/)
  })
})
