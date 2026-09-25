import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatAdminIndexedR2PhotosLine,
  formatAdminListingsInPostgresLine,
  LISTING_PHOTO_INDEX_TABLE,
} from './admin-hero-inventory-lines'

describe('formatAdminHeroInventoryLines', () => {
  it('names listings and listing_photo_index photo rows', () => {
    assert.equal(
      formatAdminListingsInPostgresLine(29596),
      '29,596 listings in Postgres',
    )
    assert.equal(LISTING_PHOTO_INDEX_TABLE, 'listing_photo_index')
    assert.equal(
      formatAdminIndexedR2PhotosLine(695690),
      '695,690 photos referenced in Postgres listing_photo_index in R2',
    )
  })
})
