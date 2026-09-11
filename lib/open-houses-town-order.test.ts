import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mergeTownOrder,
  moveTownInOrder,
  parseTownOrderCookie,
  placeTownNextTo,
  serializeTownOrderCookie,
} from './open-houses-town-order'

const TOWNS = ['Norwalk', 'Westport', 'Wilton'] as const

describe('parseTownOrderCookie', () => {
  it('returns null for empty values', () => {
    assert.equal(parseTownOrderCookie(null), null)
    assert.equal(parseTownOrderCookie(''), null)
    assert.equal(parseTownOrderCookie('  , , '), null)
  })

  it('splits comma-separated names', () => {
    assert.deepEqual(parseTownOrderCookie('Wilton, Westport'), ['Wilton', 'Westport'])
  })
})

describe('mergeTownOrder', () => {
  it('keeps the live list when there is no preference', () => {
    assert.deepEqual(mergeTownOrder(null, TOWNS), [...TOWNS])
  })

  it('applies a stored order and appends missing towns', () => {
    assert.deepEqual(mergeTownOrder(['Wilton', 'Darien', 'Westport'], TOWNS), [
      'Wilton',
      'Westport',
      'Norwalk',
    ])
  })

  it('is case-insensitive and de-dupes', () => {
    assert.deepEqual(mergeTownOrder(['wilton', 'Wilton', 'westport'], TOWNS), [
      'Wilton',
      'Westport',
      'Norwalk',
    ])
  })
})

describe('placeTownNextTo / moveTownInOrder', () => {
  it('moves a town immediately before or after a neighbor', () => {
    assert.deepEqual(placeTownNextTo(TOWNS, 'Wilton', 'Norwalk', 'before'), [
      'Wilton',
      'Norwalk',
      'Westport',
    ])
    assert.deepEqual(placeTownNextTo(TOWNS, 'Norwalk', 'Wilton', 'after'), [
      'Westport',
      'Wilton',
      'Norwalk',
    ])
  })

  it('moves one step with arrows', () => {
    assert.deepEqual(moveTownInOrder(TOWNS, 'Westport', -1), [
      'Westport',
      'Norwalk',
      'Wilton',
    ])
    assert.deepEqual(moveTownInOrder(TOWNS, 'Westport', 1), [
      'Norwalk',
      'Wilton',
      'Westport',
    ])
    assert.deepEqual(moveTownInOrder(TOWNS, 'Norwalk', -1), [...TOWNS])
  })
})

describe('serializeTownOrderCookie', () => {
  it('joins names for the cookie', () => {
    assert.equal(serializeTownOrderCookie(['Wilton', 'Westport']), 'Wilton,Westport')
  })
})
