import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  visionStreetPidNeedsOwnerCatchUp,
  visionStreetPidNeedsOwnerFill,
  VISION_OWNER_RETRY_AFTER_MS,
} from './vision-street-owner-catchup'

describe('visionStreetPidNeedsOwnerCatchUp', () => {
  it('is true only when the street-house PID has no vision_addresses row', () => {
    assert.equal(visionStreetPidNeedsOwnerCatchUp(false), true)
    assert.equal(visionStreetPidNeedsOwnerCatchUp(true), false)
  })
})

describe('visionStreetPidNeedsOwnerFill', () => {
  const now = new Date('2026-09-15T15:00:00.000Z')

  it('fills never-ingested PIDs', () => {
    assert.equal(
      visionStreetPidNeedsOwnerFill({
        hasVisionAddress: false,
        ownerName: null,
        scrapedAt: null,
        now,
      }),
      true,
    )
  })

  it('does not refill a card that already has owner_name, even with no mailing', () => {
    assert.equal(
      visionStreetPidNeedsOwnerFill({
        hasVisionAddress: true,
        ownerName: 'SMITH JOHN',
        scrapedAt: now,
        now,
      }),
      false,
    )
  })

  it('does not retry an empty owner_name inside the weekly window', () => {
    assert.equal(
      visionStreetPidNeedsOwnerFill({
        hasVisionAddress: true,
        ownerName: '  ',
        scrapedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        now,
      }),
      false,
    )
  })

  it('retries an empty owner_name after a week', () => {
    assert.equal(
      visionStreetPidNeedsOwnerFill({
        hasVisionAddress: true,
        ownerName: '',
        scrapedAt: new Date(now.getTime() - VISION_OWNER_RETRY_AFTER_MS),
        now,
      }),
      true,
    )
  })
})
