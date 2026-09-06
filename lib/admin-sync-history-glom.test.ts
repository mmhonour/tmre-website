import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSyncHistorySkipMessage } from './admin-sync-history-glom'

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
