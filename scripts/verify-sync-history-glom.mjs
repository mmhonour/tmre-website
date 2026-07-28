/**
 * Verifies Sync History glom keeps queue audits visible as their own bucket
 * alongside town Active+Closed rows (the refresh “vanishing” bug).
 *
 * Run: npx tsx scripts/verify-sync-history-glom.mjs
 */
import assert from 'node:assert/strict'
import {
  glomSyncHistoryRuns,
  normalizeSyncStatusBucket,
  normalizeSyncType,
} from '../lib/admin-sync-history-glom.ts'

assert.equal(normalizeSyncStatusBucket('Queued/incremental'), 'Queued')
assert.equal(normalizeSyncStatusBucket('Worker/incremental'), 'Worker')
assert.equal(normalizeSyncStatusBucket('Active+Closed/incremental'), 'Active+Closed')
assert.equal(normalizeSyncType('Queued/incremental'), 'Incremental')
assert.equal(normalizeSyncType('Worker/incremental'), 'Incremental')
assert.equal(normalizeSyncType('Active+Closed/incremental'), 'Incremental')

const started = '2026-07-27T20:33:38.000Z'
const townStart = '2026-07-27T20:34:10.000Z'
const rows = [
  {
    id: 1,
    startedAt: started,
    finishedAt: started,
    town: '(all)',
    statusBucket: 'Queued/incremental',
    listingsCount: 0,
    ok: true,
    error: 'queued background worker (admin) — site HTTP 202',
  },
  {
    id: 2,
    startedAt: townStart,
    finishedAt: '2026-07-27T20:34:40.000Z',
    town: 'Westport',
    statusBucket: 'Active+Closed/incremental',
    listingsCount: 3,
    ok: true,
    error: null,
  },
  {
    id: 3,
    startedAt: '2026-07-27T20:34:41.000Z',
    finishedAt: '2026-07-27T20:35:10.000Z',
    town: 'Norwalk',
    statusBucket: 'Active+Closed/incremental',
    listingsCount: 5,
    ok: true,
    error: null,
  },
  {
    id: 4,
    startedAt: started,
    finishedAt: '2026-07-27T20:35:12.000Z',
    town: '(all)',
    statusBucket: 'Done/incremental',
    listingsCount: 8,
    ok: true,
    error: null,
  },
]

const glommed = glomSyncHistoryRuns(rows)
const buckets = new Set(glommed.map((r) => r.bucket))
assert.ok(buckets.has('Queued'), `expected Queued bucket, got ${[...buckets]}`)
assert.ok(
  buckets.has('Active+Closed'),
  `expected Active+Closed bucket, got ${[...buckets]}`,
)
assert.ok(buckets.has('Done'), `expected Done bucket, got ${[...buckets]}`)

const queued = glommed.find((r) => r.bucket === 'Queued')
assert.ok(queued, 'queued glom row missing')
assert.equal(queued.ok, true)
assert.match(queued.error ?? '', /queued background worker/)
assert.equal(queued.syncType, 'Incremental')

const done = glommed.find((r) => r.bucket === 'Done')
assert.ok(done, 'done glom row missing')
assert.equal(done.listingsCount, 8)
assert.equal(done.syncType, 'Incremental')

// Legacy mislabeled queue ack (Active/incremental) must still glom separately
// from Active+Closed town rows — expand-all-buckets is the UI safety net.
const legacy = glomSyncHistoryRuns([
  {
    id: 10,
    startedAt: started,
    finishedAt: started,
    town: '(all)',
    statusBucket: 'Active/incremental',
    listingsCount: 0,
    ok: true,
    error: 'queued background worker (admin)',
  },
  {
    id: 11,
    startedAt: townStart,
    finishedAt: townStart,
    town: 'Westport',
    statusBucket: 'Active+Closed/incremental',
    listingsCount: 2,
    ok: true,
    error: null,
  },
])
const legacyBuckets = new Set(legacy.map((r) => r.bucket))
assert.ok(legacyBuckets.has('Active'))
assert.ok(legacyBuckets.has('Active+Closed'))
assert.equal(legacyBuckets.size, 2, 'queue Active must not merge into Active+Closed')

console.log('OK — sync history glom keeps Queued vs Active+Closed distinct')
