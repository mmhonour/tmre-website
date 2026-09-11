import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  STREET_TYPE_ABBREVIATIONS,
  streetLineWithoutType,
} from './street-type-abbreviations'

describe('streetLineWithoutType', () => {
  it('drops Rd and Road', () => {
    assert.equal(streetLineWithoutType('16 Sea Spray Rd'), '16 Sea Spray')
    assert.equal(streetLineWithoutType('16 Sea Spray Road'), '16 Sea Spray')
  })

  it('drops Ln and Lane', () => {
    assert.equal(streetLineWithoutType('5 Locust Ln'), '5 Locust')
    assert.equal(streetLineWithoutType('5 Locust Lane'), '5 Locust')
  })
})

describe('STREET_TYPE_ABBREVIATIONS', () => {
  it('has unique short/long pairs', () => {
    const keys = STREET_TYPE_ABBREVIATIONS.map((row) => `${row.short}:${row.long}`)
    assert.equal(keys.length, new Set(keys).size)
  })
})
