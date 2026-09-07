import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ComparableListing } from './listing-comparables-shared'
import {
  IF_STRIP_BOOST_ONE_STEP,
  IF_STRIP_BOOST_THREE_STEPS,
  IF_STRIP_BOOST_TOWN,
  IF_STRIP_BOOST_TWO_STEPS,
  inlandStripBoostPct,
  preferSoldOverSameProperty,
  selectStripSearchPool,
  stripSearchRings,
} from './listing-if-strip-search'
import type { CoastalStripIndex } from './location-estimate-zip-grid-shared'

function soldComp(args: {
  mlsId: string
  ppsf: number
  strip: CoastalStripIndex | null
  beds?: number
  baths?: number
  sqft?: number
  townCenter?: boolean
  lat?: number
  lon?: number
  address?: string
  parcelNumber?: string | null
  underAgreement?: boolean
  closeDate?: string
}): ComparableListing {
  const sqft = args.sqft ?? 1040
  return {
    mlsId: args.mlsId,
    listingKey: args.mlsId,
    address: args.address ?? `${args.mlsId} Test Rd`,
    city: 'Fairfield',
    zip: '06824',
    parcelNumber: args.parcelNumber ?? null,
    price: args.ppsf * sqft,
    closePrice: args.ppsf * sqft,
    closeDate: args.closeDate ?? '2026-06-01',
    beds: args.beds ?? 3,
    baths: args.baths ?? 2,
    lotAcres: 0.15,
    sqft,
    vintageBucket: '1900-1940',
    vintageLabel: '1900–1940',
    yearBuilt: 1928,
    furnished: null,
    pricePerSqft: args.ppsf,
    dom: 10,
    photoCount: 4,
    latitude: args.lat ?? 41.13,
    longitude: args.lon ?? -73.24,
    locationPremiumMultiplier: 1,
    coastalStrip: args.strip,
    inTownCenter: args.townCenter ?? false,
    conditionGrade: 'excellent',
    underAgreement: args.underAgreement ?? false,
  }
}

const subject = {
  beds: 3,
  baths: 2,
  sqft: 1040,
  conditionGrade: 'excellent' as const,
  mlsId: 'subject',
}

describe('coastal strip search', () => {
  it('walks outward from the subject strip and never seaward', () => {
    assert.deepEqual(stripSearchRings(0), [0, 1, 2, 3, 'town'])
    assert.deepEqual(stripSearchRings(1), [1, 2, 3, 'town'])
    assert.deepEqual(stripSearchRings(3), [3, 'town'])
  })

  it('boosts only inland rings from a Coast subject', () => {
    assert.equal(inlandStripBoostPct(0, 0), 0)
    assert.equal(inlandStripBoostPct(0, 1), IF_STRIP_BOOST_ONE_STEP)
    assert.equal(inlandStripBoostPct(0, 2), IF_STRIP_BOOST_TWO_STEPS)
    assert.equal(inlandStripBoostPct(0, 3), IF_STRIP_BOOST_THREE_STEPS)
    assert.equal(inlandStripBoostPct(0, 'town'), IF_STRIP_BOOST_TOWN)
  })

  it('boosts by steps inland from a 2nd-strip subject', () => {
    assert.equal(inlandStripBoostPct(1, 1), 0)
    assert.equal(inlandStripBoostPct(1, 2), IF_STRIP_BOOST_ONE_STEP)
    assert.equal(inlandStripBoostPct(1, 3), IF_STRIP_BOOST_TWO_STEPS)
    assert.equal(inlandStripBoostPct(1, 'town'), IF_STRIP_BOOST_TOWN)
    assert.equal(inlandStripBoostPct(1, 0), 0)
  })

  it('stops at the first ring with three sold or UAG comps', () => {
    const selected = selectStripSearchPool({
      subjectStrip: 1,
      subject,
      sold: [
        soldComp({ mlsId: 'coast-a', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 'coast-b', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 'coast-c', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 's2-a', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 's2-b', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 's3-a', ppsf: 800, strip: 2 }),
        soldComp({ mlsId: 's3-b', ppsf: 800, strip: 2 }),
        soldComp({ mlsId: 's3-c', ppsf: 800, strip: 2 }),
      ],
      underAgreement: [soldComp({ mlsId: 's2-uag', ppsf: 1120, strip: 1 })],
    })
    assert.ok(selected)
    assert.equal(selected.ring, 1)
    assert.equal(selected.comps.length, 3)
    assert.ok(selected.comps.every((comp) => comp.coastalStrip === 1))
    assert.ok(selected.comps.every((comp) => (comp.stripBoostPct ?? 0) === 0))
    assert.ok(selected.comps.every((comp) => !comp.mlsId.startsWith('coast')))
  })

  it('moves inland and boosts when the subject strip lacks three comps', () => {
    const selected = selectStripSearchPool({
      subjectStrip: 1,
      subject,
      sold: [
        soldComp({ mlsId: 's2-only', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 's3-a', ppsf: 800, strip: 2 }),
        soldComp({ mlsId: 's3-b', ppsf: 820, strip: 2 }),
        soldComp({ mlsId: 's3-c', ppsf: 840, strip: 2 }),
        soldComp({ mlsId: 'coast', ppsf: 1500, strip: 0 }),
      ],
    })
    assert.ok(selected)
    assert.equal(selected.ring, 2)
    assert.equal(selected.comps.length, 3)
    assert.ok(
      selected.comps.every(
        (comp) => comp.stripBoostPct === IF_STRIP_BOOST_ONE_STEP,
      ),
    )
  })

  it('excludes town-center comps from coastal strip valuation', () => {
    const selected = selectStripSearchPool({
      subjectStrip: 1,
      subject,
      sold: [
        soldComp({
          mlsId: 'center-a',
          ppsf: 700,
          strip: 1,
          lat: 41.1408,
          lon: -73.2637,
        }),
        soldComp({
          mlsId: 'center-b',
          ppsf: 700,
          strip: 1,
          lat: 41.1408,
          lon: -73.2637,
        }),
        soldComp({
          mlsId: 'center-c',
          ppsf: 700,
          strip: 1,
          lat: 41.1408,
          lon: -73.2637,
        }),
        soldComp({ mlsId: 's3-a', ppsf: 800, strip: 2 }),
        soldComp({ mlsId: 's3-b', ppsf: 800, strip: 2 }),
        soldComp({ mlsId: 's3-c', ppsf: 800, strip: 2 }),
      ],
    })
    assert.ok(selected)
    assert.equal(selected.ring, 2)
    assert.ok(selected.comps.every((comp) => !comp.mlsId.startsWith('center')))
  })

  it('never uses a more-coastal strip as the basis', () => {
    const selected = selectStripSearchPool({
      subjectStrip: 2,
      subject,
      sold: [
        soldComp({ mlsId: 'coast-a', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 'coast-b', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 'coast-c', ppsf: 1400, strip: 0 }),
        soldComp({ mlsId: 's2-a', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 's2-b', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 's2-c', ppsf: 1100, strip: 1 }),
        soldComp({ mlsId: 'town-a', ppsf: 600, strip: null }),
        soldComp({ mlsId: 'town-b', ppsf: 610, strip: null }),
        soldComp({ mlsId: 'town-c', ppsf: 620, strip: null }),
      ],
    })
    assert.ok(selected)
    assert.equal(selected.ring, 'town')
    assert.ok(selected.comps.every((comp) => comp.coastalStrip == null))
    assert.ok(
      selected.comps.every((comp) => comp.stripBoostPct === IF_STRIP_BOOST_TOWN),
    )
  })

  it('drops a UAG re-list when the same parcel already sold', () => {
    const sold = soldComp({
      mlsId: '877-sold',
      ppsf: 964,
      strip: 3,
      address: '877 South Pine Creek Road',
      parcelNumber: '134429',
      sqft: 1297,
    })
    const uag = soldComp({
      mlsId: '877-uag',
      ppsf: 1002,
      strip: 3,
      address: '877 South Pine Creek Rd',
      parcelNumber: '134429',
      sqft: 1297,
      underAgreement: true,
    })
    const kept = preferSoldOverSameProperty([sold, uag])
    assert.deepEqual(kept.map((c) => c.mlsId), ['877-sold'])

    const selected = selectStripSearchPool({
      subjectStrip: 3,
      subject: { ...subject, sqft: 1297 },
      sold: [
        sold,
        soldComp({ mlsId: 's4-b', ppsf: 900, strip: 3, sqft: 1297 }),
        soldComp({ mlsId: 's4-c', ppsf: 910, strip: 3, sqft: 1297 }),
      ],
      underAgreement: [uag],
    })
    assert.ok(selected)
    assert.equal(selected.comps.length, 3)
    assert.ok(!selected.comps.some((comp) => comp.mlsId === '877-uag'))
    assert.ok(selected.comps.some((comp) => comp.mlsId === '877-sold'))
  })
})
