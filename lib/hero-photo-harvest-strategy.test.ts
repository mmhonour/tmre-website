import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_HERO_PHOTO_HARVEST,
  isHeroPhotoHarvestId,
  parseHeroPhotoHarvest,
  resolveHeroPhotoHarvest,
} from './hero-photo-harvest-strategy'
import { mergeSyncScheduleConfig } from './sync-schedule-config-shared'

describe('hero photo harvest', () => {
  it('defaults to newest listings', () => {
    assert.equal(DEFAULT_HERO_PHOTO_HARVEST, 'newest')
    assert.equal(parseHeroPhotoHarvest(undefined), 'newest')
    assert.equal(parseHeroPhotoHarvest('nope'), 'newest')
    assert.equal(isHeroPhotoHarvestId('closed-oldest'), true)
    assert.equal(resolveHeroPhotoHarvest({}), 'newest')
    assert.equal(resolveHeroPhotoHarvest({ harvest: 'almost-full' }), 'almost-full')
  })

  it('keeps Configure harvest on the scavenger schedule row', () => {
    const merged = mergeSyncScheduleConfig({
      version: 1,
      jobs: {
        'hero-photos': {
          frequency: '15m',
          startTimeEt: '00:00',
          harvest: 'closed-oldest',
        },
      },
    })
    assert.equal(merged.jobs['hero-photos'].harvest, 'closed-oldest')
  })
})
