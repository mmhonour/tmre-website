import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addCalendarDays,
  formatOpenHouseHistory,
  openHouseHorizonWindow,
  openHouseLookbackWindow,
  splitDateWindow,
} from './open-houses'

describe('splitDateWindow', () => {
  it('splits an inclusive range into 31-day chunks', () => {
    const chunks = splitDateWindow({ start: '2026-01-01', end: '2026-03-15' }, 31)
    assert.deepEqual(chunks, [
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-03-03' },
      { start: '2026-03-04', end: '2026-03-15' },
    ])
  })

  it('returns nothing when start is after end', () => {
    assert.deepEqual(splitDateWindow({ start: '2026-02-01', end: '2026-01-01' }), [])
  })
})

describe('lookback / horizon windows', () => {
  it('lookback ends yesterday and horizon starts today', () => {
    const from = new Date('2026-09-02T16:00:00Z')
    const today = '2026-09-02'
    const lookback = openHouseLookbackWindow(from)
    const horizon = openHouseHorizonWindow(from)
    assert.equal(lookback.end, addCalendarDays(today, -1))
    assert.equal(horizon.start, today)
    assert.ok(lookback.start < lookback.end)
    assert.ok(horizon.end > horizon.start)
  })
})

describe('formatOpenHouseHistory', () => {
  it('uses singular and plural labels', () => {
    assert.equal(formatOpenHouseHistory(1, 1), '1 past · 1 upcoming')
    assert.equal(formatOpenHouseHistory(0, 3), '0 past · 3 upcoming')
  })
})
