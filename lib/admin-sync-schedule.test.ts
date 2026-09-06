import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isJobDueBySchedule } from './admin-sync-schedule'
import type { SyncJobScheduleConfig } from './sync-schedule-config-shared'

const weeklyMonday5am: SyncJobScheduleConfig = {
  frequency: 'weekly',
  startTimeEt: '05:00',
  weekdayEt: 1,
}

const monthly330: SyncJobScheduleConfig = {
  frequency: 'monthly',
  startTimeEt: '03:30',
}

describe('isJobDueBySchedule', () => {
  it('treats never-finished monthly CAMA as due mid-month', () => {
    // Sunday 6 Sep 2026 01:00 ET — after the 1 Sep 03:30 slot.
    const now = new Date('2026-09-06T05:00:00.000Z')
    assert.equal(isJobDueBySchedule(monthly330, null, now), true)
  })

  it('treats never-finished weekly Edge as due after the last Monday slot', () => {
    const now = new Date('2026-09-06T05:00:00.000Z')
    assert.equal(isJobDueBySchedule(weeklyMonday5am, null, now), true)
  })

  it('does not treat a just-finished monthly job as due the same month', () => {
    const now = new Date('2026-09-06T05:00:00.000Z')
    assert.equal(
      isJobDueBySchedule(monthly330, '2026-09-01T07:40:00.000Z', now),
      false,
    )
  })
})
