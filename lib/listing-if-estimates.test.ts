import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ComparableListing } from './listing-comparables-shared'
import {
  estimateFromComparables,
  IF_LOCATION_WEIGHT_TIER_1,
  IF_LOCATION_WEIGHT_TIER_2,
  IF_VINTAGE_WEIGHT_SAME,
} from './listing-if-estimates'
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
}): ComparableListing {
  const sqft = 2000
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
    vintageBucket: '1941-1970',
    vintageLabel: '1941–1970',
    yearBuilt: 1960,
    furnished: null,
    pricePerSqft: args.ppsf,
    dom: 12,
    photoCount: 4,
    latitude: 41.12,
    longitude: -73.26,
    locationPremiumMultiplier: args.multiplier ?? 1,
    coastalStrip: args.strip,
  }
}

describe('What-if coastal strips', () => {
  it('prefers same-strip comps when at least three painted peers exist', () => {
    const sold = [
      soldComp({ mlsId: 'c1', ppsf: 900, strip: 0 }),
      soldComp({ mlsId: 'c2', ppsf: 900, strip: 0 }),
      soldComp({ mlsId: 'c3', ppsf: 900, strip: 0 }),
      soldComp({ mlsId: 'inland-1', ppsf: 780, strip: 2 }),
      soldComp({ mlsId: 'inland-2', ppsf: 780, strip: 2 }),
      soldComp({ mlsId: 'inland-3', ppsf: 780, strip: 2 }),
      soldComp({ mlsId: 'inland-4', ppsf: 780, strip: 2 }),
      soldComp({ mlsId: 'inland-5', ppsf: 780, strip: 2 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      2000,
      850 * 2000,
      {
        subjectVintage: '1941-1970',
        locationPremium: premium(0),
      },
    )
    assert.equal(scenario.soldCount, 3)
    assert.equal(scenario.comps.length, 3)
    assert.ok(scenario.comps.every((row) => row.mlsId.startsWith('c')))
    assert.equal(scenario.math.blendedPpsf, 900)
  })

  it('scales PPSF by 0.75^n when both sides are painted on different strips', () => {
    const sold = [soldComp({ mlsId: 'second', ppsf: 750, strip: 1 })]
    const scenario = estimateFromComparables(
      sold,
      [],
      2000,
      null,
      {
        subjectVintage: '1941-1970',
        locationPremium: premium(0),
      },
    )
    assert.ok(scenario.math.blendedPpsf != null)
    assert.ok(Math.abs((scenario.math.blendedPpsf ?? 0) - 1000) < 1e-6)
    assert.equal(scenario.comps[0]?.weight, IF_VINTAGE_WEIGHT_SAME * IF_LOCATION_WEIGHT_TIER_2)
  })

  it('weights same-strip comps at the close-tier factor', () => {
    const sold = [
      soldComp({ mlsId: 'a', ppsf: 800, strip: 0 }),
      soldComp({ mlsId: 'b', ppsf: 800, strip: 0 }),
      soldComp({ mlsId: 'c', ppsf: 800, strip: 0 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      2000,
      800 * 2000,
      {
        subjectVintage: '1941-1970',
        locationPremium: premium(0),
      },
    )
    for (const row of scenario.comps) {
      assert.equal(row.weight, IF_VINTAGE_WEIGHT_SAME * IF_LOCATION_WEIGHT_TIER_1)
    }
  })

  it('keeps pin-multiplier weighting when the subject is unpainted', () => {
    const sold = [
      soldComp({ mlsId: 'near', ppsf: 800, strip: null, multiplier: 1.1 }),
    ]
    const scenario = estimateFromComparables(
      sold,
      [],
      2000,
      null,
      {
        subjectVintage: '1941-1970',
        locationPremium: premium(null, 1.1),
      },
    )
    assert.equal(scenario.math.blendedPpsf, 800)
    assert.equal(scenario.comps[0]?.weight, IF_VINTAGE_WEIGHT_SAME * IF_LOCATION_WEIGHT_TIER_1)
  })
})
