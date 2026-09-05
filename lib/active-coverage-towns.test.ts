import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coverageTownsLabel,
  knownCoverageTowns,
  orderCoverageTowns,
} from './active-coverage-towns'

describe('orderCoverageTowns', () => {
  it('keeps the compile-time TMRE order, then extras A–Z', () => {
    assert.deepEqual(
      orderCoverageTowns(['Easton', 'Westport', 'Norwalk', 'Ridgefield']),
      ['Norwalk', 'Westport', 'Ridgefield', 'Easton'],
    )
  })

  it('drops blanks', () => {
    assert.deepEqual(orderCoverageTowns(['Westport', '', '  ']), ['Westport'])
  })
})

describe('knownCoverageTowns', () => {
  it('returns only towns with zip / MLS-code support', () => {
    assert.deepEqual(knownCoverageTowns(['Easton', 'Westport', 'Norwalk']), [
      'Norwalk',
      'Westport',
    ])
  })
})

describe('coverageTownsLabel', () => {
  it('names every town, not a 3-town subset', () => {
    const label = coverageTownsLabel([
      'Norwalk',
      'New Canaan',
      'Westport',
      'Wilton',
      'Weston',
      'Fairfield',
      'Ridgefield',
    ])
    assert.equal(
      label,
      'Norwalk, New Canaan, Westport, Wilton, Weston, Fairfield, and Ridgefield',
    )
    assert.ok(!label.startsWith('Norwalk, Westport, and Fairfield'))
  })
})
