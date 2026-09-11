import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fingerprintCriteria,
  formatCriteriaPriceRange,
  isMeaningfulCriteria,
  labelCriteria,
  listUniqueVisitorSearchesOrFallback,
  normalizeVisitorSearchCriteria,
  type VisitorSearchCriteria,
} from './visitor-search-profile'

const base = (): VisitorSearchCriteria =>
  normalizeVisitorSearchCriteria({
    source: 'intelligence',
    town: 'Westport',
    tx: 'sale',
    propertyClass: 'residential',
    saleProperty: 'homes',
    minBeds: null,
    maxBeds: null,
    minBaths: null,
    maxBaths: null,
    zip: null,
    newConstruction: null,
    boardStatus: null,
    minPrice: null,
    maxPrice: null,
  })

describe('formatCriteriaPriceRange', () => {
  it('formats a closed band and open ends', () => {
    assert.equal(formatCriteriaPriceRange(800_000, 2_000_000), '$800K–$2M')
    assert.equal(formatCriteriaPriceRange(1_000_000, null), '$1M+')
    assert.equal(formatCriteriaPriceRange(null, 750_000), 'Up to $750K')
    assert.equal(formatCriteriaPriceRange(null, null), null)
  })
})

describe('labelCriteria', () => {
  it('appends the price band after town and home type', () => {
    const c = { ...base(), minPrice: 800_000, maxPrice: 2_000_000 }
    assert.equal(labelCriteria(c), 'Westport · for sale · homes · $800K–$2M')
  })
})

describe('fingerprintCriteria', () => {
  it('treats missing prices the same as null', () => {
    const withNulls = base()
    const legacy = { ...withNulls }
    delete (legacy as { minPrice?: number | null }).minPrice
    delete (legacy as { maxPrice?: number | null }).maxPrice
    assert.equal(
      fingerprintCriteria(normalizeVisitorSearchCriteria(legacy)),
      fingerprintCriteria(withNulls),
    )
  })

  it('changes when the price band changes', () => {
    const a = fingerprintCriteria(base())
    const b = fingerprintCriteria({ ...base(), minPrice: 500_000 })
    assert.notEqual(a, b)
  })
})

describe('listUniqueVisitorSearchesOrFallback', () => {
  it('uses the page fallback when the visitor has no history', () => {
    const { searches, usedFallback } = listUniqueVisitorSearchesOrFallback({
      ...base(),
      minPrice: 800_000,
      maxPrice: 2_000_000,
    })
    assert.equal(usedFallback, true)
    assert.equal(searches.length, 1)
    assert.equal(searches[0]?.label, 'Westport · for sale · homes · $800K–$2M')
  })
})

describe('isMeaningfulCriteria', () => {
  it('counts a price-only band as enough for an alert', () => {
    const empty = normalizeVisitorSearchCriteria({
      source: 'custom',
      town: null,
      tx: null,
      propertyClass: null,
      saleProperty: null,
      minBeds: null,
      maxBeds: null,
      minBaths: null,
      maxBaths: null,
      zip: null,
      newConstruction: null,
      boardStatus: null,
      minPrice: 900_000,
      maxPrice: null,
    })
    assert.equal(isMeaningfulCriteria(empty), true)
  })
})
