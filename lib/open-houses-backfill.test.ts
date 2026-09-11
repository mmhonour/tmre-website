import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OPEN_HOUSE_LOOKBACK_DAYS,
  addCalendarDays,
  openHouseLookbackWindow,
} from './open-houses'
import {
  OPEN_HOUSE_BACKFILL_CHUNK_DAYS,
  lookbackWindowForDays,
  parseBackfillOpenHouseArgs,
} from './open-houses-backfill'

describe('parseBackfillOpenHouseArgs', () => {
  it('defaults to a one-year newest-first catalogue', () => {
    assert.deepEqual(parseBackfillOpenHouseArgs([]), {
      days: OPEN_HOUSE_LOOKBACK_DAYS,
      chunkDays: OPEN_HOUSE_BACKFILL_CHUNK_DAYS,
      maxMinutes: null,
      oldestFirst: false,
    })
  })

  it('reads days, chunk size, a time cap, and oldest-first', () => {
    assert.deepEqual(
      parseBackfillOpenHouseArgs([
        '--days=180',
        '--chunk-days=7',
        '--max-minutes=45',
        '--oldest-first',
      ]),
      {
        days: 180,
        chunkDays: 7,
        maxMinutes: 45,
        oldestFirst: true,
      },
    )
  })

  it('rejects unknown flags and non-positive numbers', () => {
    assert.throws(() => parseBackfillOpenHouseArgs(['--live']), /Unknown argument/)
    assert.throws(() => parseBackfillOpenHouseArgs(['--days=0']), /positive integer/)
  })
})

describe('lookbackWindowForDays', () => {
  it('matches the shared 365-day horizon helper', () => {
    const from = new Date('2026-09-11T18:00:00Z')
    assert.deepEqual(
      lookbackWindowForDays(OPEN_HOUSE_LOOKBACK_DAYS, from),
      openHouseLookbackWindow(from),
    )
  })

  it('ends yesterday for a shorter window', () => {
    const from = new Date('2026-09-11T18:00:00Z')
    const window = lookbackWindowForDays(14, from)
    assert.equal(window.end, addCalendarDays('2026-09-11', -1))
    assert.equal(window.start, addCalendarDays('2026-09-11', -14))
  })
})
