import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { marketDigestWeekKey } from './market-digest-config'

describe('marketDigestWeekKey', () => {
  it('uses Labor Day 2026 (Monday 7 Sep) as the send-day slot', () => {
    // 16:00 UTC = noon Eastern on Monday 7 Sep 2026.
    const laborDayNoonEt = new Date('2026-09-07T16:00:00.000Z')
    assert.equal(marketDigestWeekKey(laborDayNoonEt, 1), '2026-09-07')
  })

  it('still names that Monday after Tuesday starts in Eastern', () => {
    // 04:00 UTC Tue 8 Sep = midnight Eastern.
    const tuesdayEt = new Date('2026-09-08T04:00:00.000Z')
    assert.equal(marketDigestWeekKey(tuesdayEt, 1), '2026-09-07')
  })
})
