import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cpiSyncDueRelease,
  fomcSyncDueMeeting,
} from './fed-event-sync-schedule'
import type { CpiRelease } from './cpi-calendar'
import type { FomcMeeting } from './fed-fomc-calendar'

const CPI: readonly CpiRelease[] = [
  {
    id: '2026-07',
    referenceMonth: '2026-07',
    releaseDate: '2026-08-12',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
  {
    id: '2026-08',
    referenceMonth: '2026-08',
    releaseDate: '2026-09-11',
    releaseTimeEt: '8:30 a.m. ET',
    momPct: null,
    yoyPct: null,
    coreMomPct: null,
    coreYoyPct: null,
    releaseUrl: null,
  },
]

const FOMC: readonly FomcMeeting[] = [
  {
    id: '2026-07',
    startDate: '2026-07-28',
    endDate: '2026-07-29',
    hasSep: false,
    decision: null,
    basisPoints: null,
    targetRangeLow: null,
    targetRangeHigh: null,
    statementUrl: 'https://example.test/jul',
  },
  {
    id: '2026-09',
    startDate: '2026-09-15',
    endDate: '2026-09-16',
    hasSep: true,
    decision: null,
    basisPoints: null,
    targetRangeLow: null,
    targetRangeHigh: null,
    statementUrl: 'https://example.test/sep',
  },
]

describe('cpiSyncDueRelease', () => {
  it('waits until 9:15 ET on print day when the prior print is stamped', () => {
    // Friday Sep 11 2026 8:00 ET = 12:00 UTC
    const now = new Date('2026-09-11T12:00:00.000Z')
    assert.equal(cpiSyncDueRelease(CPI, now, '09:15', '2026-07'), null)
  })

  it('is due after 9:15 ET on print day', () => {
    // Friday Sep 11 2026 10:00 ET = 14:00 UTC
    const now = new Date('2026-09-11T14:00:00.000Z')
    assert.equal(cpiSyncDueRelease(CPI, now, '09:15', null)?.id, '2026-08')
  })

  it('stays due the next morning if that print was never stamped', () => {
    // Saturday Sep 12 2026 1:40 ET = 05:40 UTC
    const now = new Date('2026-09-12T05:40:00.000Z')
    assert.equal(cpiSyncDueRelease(CPI, now, '09:15', null)?.id, '2026-08')
  })

  it('stands down once the print is stamped', () => {
    const now = new Date('2026-09-12T05:40:00.000Z')
    assert.equal(cpiSyncDueRelease(CPI, now, '09:15', '2026-08'), null)
  })
})

describe('fomcSyncDueMeeting', () => {
  it('catches up after decision day when the statement was never stamped', () => {
    const now = new Date('2026-07-30T12:00:00.000Z')
    assert.equal(fomcSyncDueMeeting(FOMC, now, '15:15', null)?.id, '2026-07')
  })

  it('stands down once that meeting is stamped', () => {
    const now = new Date('2026-07-30T12:00:00.000Z')
    assert.equal(fomcSyncDueMeeting(FOMC, now, '15:15', '2026-07'), null)
  })
})
