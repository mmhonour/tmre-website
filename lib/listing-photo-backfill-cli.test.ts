import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkpointMatchesListingPhotoBackfillJob,
  emptyListingPhotoBackfillCheckpoint,
  estimateListingPhotoBackfillEtaMs,
  filterListingsNotYetAttempted,
  formatListingPhotoBackfillDuration,
  formatListingPhotoBackfillStamp,
  formatListingPhotoSyncProgressLine,
  listingPhotoBackfillJobKey,
  listingPhotoBackfillResumeCounts,
  listingPhotoBackfillTownKey,
  parseListingPhotoBackfillCheckpoint,
  recordListingPhotoBackfillListing,
  removeListingPhotoBackfillJob,
  upsertListingPhotoBackfillJob,
} from './listing-photo-backfill-cli'

describe('formatListingPhotoBackfillStamp', () => {
  it('prints Eastern 24h as ddMmm hh:nn', () => {
    assert.equal(
      formatListingPhotoBackfillStamp(new Date('2026-09-19T18:54:00.000Z')),
      '19Sep 14:54',
    )
    assert.equal(
      formatListingPhotoBackfillStamp(new Date('2026-01-03T14:05:00.000Z')),
      '03Jan 09:05',
    )
  })
})

describe('formatListingPhotoBackfillDuration', () => {
  it('uses days and hours for a multi-day Closed walk', () => {
    assert.equal(formatListingPhotoBackfillDuration(2 * 86400_000 + 4 * 3600_000), '2d 4h')
    assert.equal(formatListingPhotoBackfillDuration(90_000), '1m 30s')
    assert.equal(formatListingPhotoBackfillDuration(12_000), '12s')
  })
})

describe('estimateListingPhotoBackfillEtaMs', () => {
  it('waits for a few listings before guessing', () => {
    assert.equal(estimateListingPhotoBackfillEtaMs(60_000, 2, 100), null)
    assert.equal(estimateListingPhotoBackfillEtaMs(60_000, 10, 0), null)
    assert.equal(estimateListingPhotoBackfillEtaMs(60_000, 10, 20), 120_000)
  })
})

describe('listingPhotoBackfillJobKey', () => {
  it('treats the same town/status/mode as one job', () => {
    assert.equal(
      listingPhotoBackfillJobKey({
        mode: 'all',
        towns: ['Westport'],
        statuses: ['Closed'],
      }),
      'all|Westport|Closed|all',
    )
  })
})

describe('filterListingsNotYetAttempted', () => {
  it('skips listings already recorded in the checkpoint', () => {
    const remaining = filterListingsNotYetAttempted(
      [
        { mlsId: 'A', listingKey: 'key-a' },
        { mlsId: 'B' },
        { mlsId: 'C', listingKey: 'key-c' },
      ],
      new Set(['key-a', 'B']),
    )
    assert.deepEqual(
      remaining.map((row) => row.mlsId),
      ['C'],
    )
  })
})

describe('listingPhotoBackfillResumeCounts', () => {
  it('keeps the original 1/4347 denominator after a stop', () => {
    assert.deepEqual(
      listingPhotoBackfillResumeCounts({
        neededFromScan: 2347,
        skippedAttempted: 0,
        saved: { needed: 4347, listingsDone: 2000, photosStored: 50000 },
      }),
      { offset: 2000, total: 4347, photosAlreadyStored: 50000 },
    )
  })
})

describe('parseListingPhotoBackfillCheckpoint', () => {
  it('round-trips a stopped Closed Westport job', () => {
    const started = emptyListingPhotoBackfillCheckpoint({
      key: listingPhotoBackfillJobKey({
        mode: 'all',
        towns: ['Westport'],
        statuses: ['Closed'],
      }),
      mode: 'all',
      towns: ['Westport'],
      statuses: ['Closed'],
      limit: 0,
      nowMs: 1_000,
    })
    const runStartedAtMs = 10_000
    const afterFirst = recordListingPhotoBackfillListing(started, {
      townStatus: listingPhotoBackfillTownKey('Westport', 'Closed'),
      cacheId: 'key-a',
      stored: 13,
      needed: 4347,
      nowMs: 10_000 + 60_000,
      runStartedAtMs,
      priorElapsedMs: 0,
    })
    const afterSecond = recordListingPhotoBackfillListing(afterFirst, {
      townStatus: listingPhotoBackfillTownKey('Westport', 'Closed'),
      cacheId: 'key-b',
      stored: 2,
      needed: 4347,
      nowMs: 10_000 + 120_000,
      runStartedAtMs,
      priorElapsedMs: 0,
    })
    assert.equal(afterSecond.elapsedMs, 120_000)
    assert.equal(afterSecond.listingsDone, 2)
    assert.equal(afterSecond.photosStored, 15)
    assert.deepEqual(afterSecond.doneIds, ['key-a', 'key-b'])

    const parsed = parseListingPhotoBackfillCheckpoint(JSON.stringify(afterSecond))
    assert.ok(parsed)
    assert.equal(
      checkpointMatchesListingPhotoBackfillJob(parsed, started.key),
      true,
    )
    assert.equal(
      checkpointMatchesListingPhotoBackfillJob(parsed, 'hero|Westport|Active|all'),
      false,
    )
  })

  it('rejects junk', () => {
    assert.equal(parseListingPhotoBackfillCheckpoint('{'), null)
    assert.equal(parseListingPhotoBackfillCheckpoint('{"version":2}'), null)
  })
})

describe('listingPhotoBackfillProgressFile', () => {
  it('keeps a stopped Westport job when Norwalk starts', () => {
    const westport = emptyListingPhotoBackfillCheckpoint({
      key: 'all|Westport|Closed|all',
      mode: 'all',
      towns: ['Westport'],
      statuses: ['Closed'],
      limit: 0,
      nowMs: 1,
    })
    const file = upsertListingPhotoBackfillJob(
      { version: 1, jobs: {} },
      westport,
    )
    const norwalk = emptyListingPhotoBackfillCheckpoint({
      key: 'all|Norwalk|Closed|all',
      mode: 'all',
      towns: ['Norwalk'],
      statuses: ['Closed'],
      limit: 0,
      nowMs: 2,
    })
    const both = upsertListingPhotoBackfillJob(file, norwalk)
    assert.equal(Object.keys(both.jobs).length, 2)
    const withoutNorwalk = removeListingPhotoBackfillJob(
      both,
      'all|Norwalk|Closed|all',
    )
    assert.equal(withoutNorwalk.jobs['all|Westport|Closed|all']?.key, westport.key)
    assert.equal(withoutNorwalk.jobs['all|Norwalk|Closed|all'], undefined)
  })
})

describe('formatListingPhotoSyncProgressLine', () => {
  it('stamps Eastern time and elapsed on a listing line', () => {
    const line = formatListingPhotoSyncProgressLine({
      at: new Date('2026-09-19T18:54:00.000Z'),
      label: 'Westport Closed',
      position: 10,
      total: 4347,
      address: '66 Beachside Avenue',
      stored: 39,
      photosStored: 231,
      startedAtMs: Date.parse('2026-09-19T16:54:00.000Z'),
      priorElapsedMs: 0,
    })
    assert.equal(
      line,
      '[listing-photos-sync] 19Sep 14:54 Westport Closed 10/4347 · 2h elapsed · ~36d 3h left · 66 Beachside Avenue — 39 new (231 total this town)',
    )
  })
})
