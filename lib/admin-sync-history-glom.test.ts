import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  glomSyncHistoryRuns,
  isSyncHistorySkipMessage,
  type SyncHistoryRawRow,
} from './admin-sync-history-glom'

describe('isSyncHistorySkipMessage', () => {
  it('treats Netlify 429 queue storms as skips, not rebuild failures', () => {
    assert.equal(
      isSyncHistorySkipMessage('queue failed (admin) — HTTP 429'),
      true,
    )
    assert.equal(
      isSyncHistorySkipMessage('Stats cache queue failed — HTTP 429'),
      true,
    )
    assert.equal(
      isSyncHistorySkipMessage('Edge scores queue failed — HTTP 429'),
      true,
    )
    assert.equal(
      isSyncHistorySkipMessage(
        'skipped — Netlify rate limited (HTTP 429); not retrying this window',
      ),
      true,
    )
  })
})

describe('glomSyncHistoryRuns standalone job audits', () => {
  it('keeps each hero-photos burst as its own Start/End', () => {
    const bursts: SyncHistoryRawRow[] = [
      {
        id: 1,
        startedAt: '2026-09-14T14:25:13.000Z',
        finishedAt: '2026-09-14T14:34:15.000Z',
        town: '(all)',
        statusBucket: 'Done/hero-photos',
        listingsCount: 0,
        ok: true,
        error:
          'was 92.1% missing (1,596/1,732) · filled 630 listings / 524 photos · now 92.1% missing — Oldest-first · 630 listings / 524 photos this burst',
      },
      {
        id: 2,
        startedAt: '2026-09-14T14:40:00.000Z',
        finishedAt: '2026-09-14T14:49:00.000Z',
        town: '(all)',
        statusBucket: 'Done/hero-photos',
        listingsCount: 0,
        ok: true,
        error:
          'was 44.6% missing (773/1,733) · filled 5 listings / 30 photos · now 44.5% missing — Oldest-first · 5 listings / 30 photos this burst',
      },
      {
        id: 3,
        startedAt: '2026-09-14T14:55:00.000Z',
        finishedAt: '2026-09-14T15:04:00.000Z',
        town: '(all)',
        statusBucket: 'Done/hero-photos',
        listingsCount: 0,
        ok: true,
        error:
          'was 44.5% missing (772/1,733) · filled 5 listings / 30 photos · now 44.5% missing — Oldest-first · 5 listings / 30 photos this burst',
      },
    ]
    const glommed = glomSyncHistoryRuns(bursts)
    assert.equal(glommed.length, 3)
    assert.equal(glommed[0]?.startedAt, '2026-09-14T14:55:00.000Z')
    assert.equal(glommed[0]?.finishedAt, '2026-09-14T15:04:00.000Z')
    assert.match(glommed[0]?.error ?? '', /772\/1,733/)
    assert.equal(glommed[2]?.startedAt, '2026-09-14T14:25:13.000Z')
    assert.equal(glommed[2]?.finishedAt, '2026-09-14T14:34:15.000Z')
    assert.match(glommed[2]?.error ?? '', /1,596\/1,732/)
    assert.ok((glommed[2]?.durationMs ?? 0) < 15 * 60 * 1000)
  })

  it('does not glue two Incremental pulls into one 4pm–10am line', () => {
    const rows: SyncHistoryRawRow[] = [
      {
        id: 10,
        startedAt: '2026-09-12T20:00:51.000Z',
        finishedAt: '2026-09-12T20:01:20.000Z',
        town: 'Westport',
        statusBucket: 'Active+Closed/incremental',
        listingsCount: 32,
        ok: true,
        error: null,
      },
      {
        id: 11,
        startedAt: '2026-09-12T20:01:21.000Z',
        finishedAt: '2026-09-12T20:02:10.000Z',
        town: 'Norwalk',
        statusBucket: 'Active+Closed/incremental',
        listingsCount: 79,
        ok: true,
        error: null,
      },
      {
        id: 12,
        startedAt: '2026-09-12T20:10:00.000Z',
        finishedAt: '2026-09-12T20:12:00.000Z',
        town: 'Westport',
        statusBucket: 'Done/vision',
        listingsCount: 40,
        ok: true,
        error: 'Westport: 10,516 vision rows',
      },
      {
        id: 13,
        startedAt: '2026-09-14T14:00:22.000Z',
        finishedAt: '2026-09-14T14:02:25.000Z',
        town: 'Westport',
        statusBucket: 'Active+Closed/incremental',
        listingsCount: 28,
        ok: true,
        error: null,
      },
      {
        id: 14,
        startedAt: '2026-09-14T14:02:26.000Z',
        finishedAt: '2026-09-14T14:03:10.000Z',
        town: 'Norwalk',
        statusBucket: 'Active+Closed/incremental',
        listingsCount: 61,
        ok: true,
        error: null,
      },
    ]
    const glommed = glomSyncHistoryRuns(rows)
    const incremental = glommed.filter(
      (r) => r.syncType === 'Incremental' && r.bucket === 'Active+Closed',
    )
    assert.equal(incremental.length, 2)
    assert.equal(incremental[1]?.startedAt, '2026-09-12T20:00:51.000Z')
    assert.equal(incremental[1]?.finishedAt, '2026-09-12T20:02:10.000Z')
    assert.ok((incremental[1]?.durationMs ?? 0) < 10 * 60 * 1000)
    assert.equal(incremental[0]?.startedAt, '2026-09-14T14:00:22.000Z')
    assert.equal(incremental[0]?.finishedAt, '2026-09-14T14:03:10.000Z')
    assert.match(incremental[1]?.townsLabel ?? '', /Norwalk \(79\)/)
    assert.match(incremental[0]?.townsLabel ?? '', /Norwalk \(61\)/)
  })
})
