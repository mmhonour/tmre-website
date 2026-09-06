import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SYNC_QUEUE_RUNNER_JOBS,
  isSyncQueueRunnerJob,
  syncQueueClaimYieldRank,
} from './sync-queue-shared'

describe('SYNC_QUEUE_RUNNER_JOBS', () => {
  it('claims edge-scores so Admin and thin cron do not hop to a Netlify worker', () => {
    assert.equal(isSyncQueueRunnerJob('edge-scores'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('edge-scores'))
  })

  it('claims cama-tax so the monthly slot is not Railway-sweep-only', () => {
    assert.equal(isSyncQueueRunnerJob('cama-tax'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('cama-tax'))
  })

  it('claims street-listings so /streets RETS fill runs on the Railway queue', () => {
    assert.equal(isSyncQueueRunnerJob('street-listings'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('street-listings'))
  })
})

describe('syncQueueClaimYieldRank', () => {
  it('lets stats, edge, and CAMA go ahead of a waiting Incremental', () => {
    assert.equal(syncQueueClaimYieldRank('stats-cache'), 0)
    assert.equal(syncQueueClaimYieldRank('edge-scores'), 0)
    assert.equal(syncQueueClaimYieldRank('cama-tax'), 0)
    assert.equal(syncQueueClaimYieldRank('incremental'), 1)
  })
})
