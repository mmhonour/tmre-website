import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ComparableListing } from './listing-comparables-shared'
import { estimateFromComparables } from './listing-if-estimates'
import { IF_STRIP_BOOST_ONE_STEP } from './listing-if-strip-search'
import type { LocationPremiumFactors } from './listing-location-premium'
import type { CoastalStripIndex } from './location-estimate-zip-grid-shared'

function premium(
  strip: CoastalStripIndex | null,
  combinedMultiplier = 1.1,
): LocationPremiumFactors {
  return {
    waterMiles: 0.1,
    townCenterMiles: null,
    golfMiles: null,
    coastalStrip: strip,
    waterMultiplier: combinedMultiplier,
    centerMultiplier: 1,
    golfMultiplier: 1,
    combinedMultiplier,
    labels: strip != null ? [`strip ${strip}`] : [],
  }
}

function soldComp(args: {
  mlsId: string
  ppsf: number
  strip: CoastalStripIndex | null
  multiplier?: number
  boost?: number
}): ComparableListing {
  const sqft = 1040
  return {
    mlsId: args.mlsId,
    listingKey: args.mlsId,
    address: `${args.mlsId} Test Rd`,
    city: 'Fairfield',
    zip: '06824',
    price: args.ppsf * sqft,
    closePrice: args.ppsf * sqft,
    closeDate: '2026-06-01',
    beds: 3,
    baths: 2,
    lotAcres: 0.2,
    sqft,
    vintageBucket: '1900-1940',
    vintageLabel: '1900–1940',
    yearBuilt: 1928,
    furnished: null,
    pricePerSqft: args.ppsf,
    dom: 12,
    photoCount: 4,
    latitude: 41.12,
    longitude: -73.26,
    locationPremiumMultiplier: args.multiplier ?? 1,
    coastalStrip: args.strip,
    stripBoostPct: args.boost ?? 0,
    conditionGrade: 'excellent',
    matchFit: 'exact',
  }
}

describe('What-if coastal strips', () => {
  it('uses same-strip comps with no boost when the ring is already chosen', () => {
    const sold = [
      soldComp({ mlsId: 'c1', ppsf: 900, strip: 1 }),
      soldComp({ mlsId: 'c2', ppsf: 900, strip: 1 }),
      soldComp({ mlsId: 'c3', ppsf: 900, strip: 1 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      1040,
      1500000,
      {
        subjectVintage: '1900-1940',
        locationPremium: premium(1),
        useStripSearchBasis: true,
        stripSearch: {
          subjectStrip: 1,
          basisRing: 1,
          basisLabel: '2 2nd strip',
          foundCount: 3,
        },
      },
    )
    assert.equal(scenario.soldCount, 3)
    assert.equal(scenario.math.blendedPpsf, 900)
    assert.equal(scenario.comps[0]?.adjustedPricePerSqft, 900)
    assert.equal(scenario.comps[0]?.stripBoostPct, 0)
  })

  it('applies the temporary inland boost instead of 0.75^n', () => {
    const sold = [
      soldComp({
        mlsId: 'third',
        ppsf: 800,
        strip: 2,
        boost: IF_STRIP_BOOST_ONE_STEP,
      }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      1040,
      null,
      {
        subjectVintage: '1900-1940',
        locationPremium: premium(1),
        useStripSearchBasis: true,
        stripSearch: {
          subjectStrip: 1,
          basisRing: 2,
          basisLabel: '3 3rd strip',
          foundCount: 1,
        },
      },
    )
    assert.ok(scenario.math.blendedPpsf != null)
    assert.ok(
      Math.abs((scenario.math.blendedPpsf ?? 0) - 800 * (1 + IF_STRIP_BOOST_ONE_STEP)) <
        1e-6,
    )
    assert.equal(scenario.comps[0]?.pricePerSqft, 800)
    assert.equal(
      scenario.comps[0]?.adjustedPricePerSqft,
      800 * (1 + IF_STRIP_BOOST_ONE_STEP),
    )
  })

  it('does not filter the strip ring by the subject list $/sqft', () => {
    const sold = [
      soldComp({ mlsId: 'a', ppsf: 700, strip: 1 }),
      soldComp({ mlsId: 'b', ppsf: 710, strip: 1 }),
      soldComp({ mlsId: 'c', ppsf: 720, strip: 1 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      1040,
      1442 * 1040,
      {
        subjectVintage: '1900-1940',
        locationPremium: premium(1),
        useStripSearchBasis: true,
        stripSearch: {
          subjectStrip: 1,
          basisRing: 1,
          basisLabel: '2 2nd strip',
          foundCount: 3,
        },
      },
    )
    assert.equal(scenario.soldCount, 3)
    assert.ok((scenario.math.blendedPpsf ?? 0) < 800)
  })

  it('keeps pin-multiplier weighting when the subject is unpainted', () => {
    const sold = [
      soldComp({ mlsId: 'near', ppsf: 800, strip: null, multiplier: 1.1 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      1040,
      null,
      {
        subjectVintage: '1900-1940',
        locationPremium: premium(null, 1.1),
      },
    )
    assert.equal(scenario.math.blendedPpsf, 800)
  })
})
