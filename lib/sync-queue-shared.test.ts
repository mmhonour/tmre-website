import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SYNC_QUEUE_RUNNER_JOBS,
  isSyncQueueRunnerJob,
} from './sync-queue-shared'

describe('SYNC_QUEUE_RUNNER_JOBS', () => {
  it('claims edge-scores so Admin and thin cron do not hop to a Netlify worker', () => {
    assert.equal(isSyncQueueRunnerJob('edge-scores'), true)
    assert.ok(SYNC_QUEUE_RUNNER_JOBS.includes('edge-scores'))
  })
})
