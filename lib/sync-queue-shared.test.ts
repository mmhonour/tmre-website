import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SYNC_QUEUE_REAP_DETAIL,
  SYNC_QUEUE_RUNNER_JOBS,
  isSyncQueueHostLossReap,
  isSyncQueueRunnerJob,
  syncQueueClaimYieldRank,
  syncQueueOutcomeCoolsDown,
  syncQueueOutcomeLabel,
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

  it('claims db-size so the daily 6am snapshot is not a Netlify in-process scan', () => {
    assert.equal(isSyncQueueRunnerJob('db-size'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('db-size'))
  })

  it('claims hero-photos so Active hero catch-up is a forked child, not the website worker', () => {
    assert.equal(isSyncQueueRunnerJob('hero-photos'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('hero-photos'))
  })
})

describe('syncQueueClaimYieldRank', () => {
  it('lets stats, edge, and CAMA go ahead of a waiting Incremental', () => {
    assert.equal(syncQueueClaimYieldRank('stats-cache'), 0)
    assert.equal(syncQueueClaimYieldRank('edge-scores'), 0)
    assert.equal(syncQueueClaimYieldRank('cama-tax'), 0)
    assert.equal(syncQueueClaimYieldRank('incremental'), 1)
  })

  it('yields hero-photos behind Incremental and every other runner job', () => {
    assert.equal(syncQueueClaimYieldRank('hero-photos'), 2)
    assert.ok(syncQueueClaimYieldRank('hero-photos') > syncQueueClaimYieldRank('incremental'))
    assert.ok(syncQueueClaimYieldRank('incremental') > syncQueueClaimYieldRank('stats-cache'))
  })
})

describe('sync queue host-loss reap', () => {
  it('does not cool down a runner-vanished reap', () => {
    assert.equal(isSyncQueueHostLossReap(SYNC_QUEUE_REAP_DETAIL), true)
    assert.equal(syncQueueOutcomeCoolsDown('crashed', SYNC_QUEUE_REAP_DETAIL), false)
    assert.equal(syncQueueOutcomeCoolsDown('timeout', SYNC_QUEUE_REAP_DETAIL), true)
    assert.equal(
      syncQueueOutcomeCoolsDown(
        'crashed',
        'child was SIGKILLed before reporting — most likely out of memory',
      ),
      true,
    )
    assert.equal(syncQueueOutcomeCoolsDown('failed', 'RETS said no'), false)
  })

  it('labels a reap as runner vanished, not child died', () => {
    assert.equal(
      syncQueueOutcomeLabel('crashed', SYNC_QUEUE_REAP_DETAIL),
      'Stopped — runner vanished',
    )
    assert.equal(syncQueueOutcomeLabel('crashed', null), 'Crashed — child died')
  })
})
