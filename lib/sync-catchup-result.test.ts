import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { catchupFinishedJob } from './sync-catchup-result'

describe('catchupFinishedJob', () => {
  it('is false when catch-up was skipped', () => {
    assert.equal(
      catchupFinishedJob(
        { skipped: true, steps: [{ job: 'listing-scores', ok: true }] },
        'listing-scores',
      ),
      false,
    )
  })

  it('is false when the job is only queued (the deadlock)', () => {
    assert.equal(
      catchupFinishedJob(
        {
          skipped: false,
          steps: [{ job: 'listing-scores', ok: true, queued: true }],
        },
        'listing-scores',
      ),
      false,
    )
  })

  it('is false when the job is missing from steps', () => {
    assert.equal(
      catchupFinishedJob(
        {
          skipped: false,
          steps: [{ job: 'stats-cache', ok: true }],
        },
        'listing-scores',
      ),
      false,
    )
  })

  it('is false when the job failed', () => {
    assert.equal(
      catchupFinishedJob(
        {
          skipped: false,
          steps: [{ job: 'listing-scores', ok: false }],
        },
        'listing-scores',
      ),
      false,
    )
  })

  it('is true only when the job finished in-process', () => {
    assert.equal(
      catchupFinishedJob(
        {
          skipped: false,
          steps: [{ job: 'listing-scores', ok: true, queued: false }],
        },
        'listing-scores',
      ),
      true,
    )
  })

  it('worker must rebuild when catch-up only re-queued the cluster', () => {
    const catchup = {
      skipped: false,
      steps: [
        { job: 'listing-scores', ok: true, queued: true },
        { job: 'edge-scores', ok: true, queued: true },
        { job: 'stats-cache', ok: true, queued: true },
        { job: 'deal-of-the-day', ok: true, queued: true },
      ],
    }
    assert.equal(catchupFinishedJob(catchup, 'listing-scores'), false)
    assert.equal(catchupFinishedJob(catchup, 'edge-scores'), false)
    assert.equal(catchupFinishedJob(catchup, 'stats-cache'), false)
    assert.equal(catchupFinishedJob(catchup, 'deal-of-the-day'), false)
  })
})
