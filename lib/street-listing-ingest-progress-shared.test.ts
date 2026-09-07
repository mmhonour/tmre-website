import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  listingIngestStatusCopy,
  parseStreetListingIngestProgress,
  streetListingIngestIsFresh,
  streetListingIngestMetaKey,
} from './street-listing-ingest-progress-shared'
import { formatStreetListingLine } from './street-listing-card-shared'

describe('streetListingIngestMetaKey', () => {
  it('lowercases town and keeps the Vision pid', () => {
    assert.equal(
      streetListingIngestMetaKey('Westport', '3564'),
      'street_listing_ingest:westport:3564',
    )
  })
})

describe('parseStreetListingIngestProgress', () => {
  it('round-trips a found listing', () => {
    const raw = JSON.stringify({
      town: 'Westport',
      visionPid: '3564',
      addressLabel: '16 Sea Spray Rd',
      phase: 'found',
      message: 'Closed',
      listing: {
        id: 'MLS123',
        mlsId: 'MLS123',
        status: 'Closed',
        price: 2195000,
        street: '16 Sea Spray Rd',
        town: 'Westport',
      },
      updatedAt: '2026-09-06T16:00:00.000Z',
    })
    const parsed = parseStreetListingIngestProgress(raw)
    assert.ok(parsed)
    assert.equal(parsed?.phase, 'found')
    assert.equal(parsed?.listing?.id, 'MLS123')
    assert.equal(formatStreetListingLine(parsed!.listing!), 'Closed · $2,195,000')
  })

  it('rejects a malformed payload', () => {
    assert.equal(parseStreetListingIngestProgress('{"phase":"found"}'), null)
  })
})

describe('streetListingIngestIsFresh', () => {
  it('treats a 30s-old in-flight stamp as live', () => {
    const now = Date.parse('2026-09-06T16:00:30.000Z')
    assert.equal(
      streetListingIngestIsFresh(
        {
          town: 'Westport',
          visionPid: '3564',
          addressLabel: '16 Sea Spray Rd',
          phase: 'rets-address',
          message: 'Searching RETS…',
          listing: null,
          updatedAt: '2026-09-06T16:00:00.000Z',
        },
        now,
      ),
      true,
    )
  })

  it('expires a 3-minute-old stamp', () => {
    const now = Date.parse('2026-09-06T16:03:01.000Z')
    assert.equal(
      streetListingIngestIsFresh(
        {
          town: 'Westport',
          visionPid: '3564',
          addressLabel: '16 Sea Spray Rd',
          phase: 'rets-address',
          message: 'Searching RETS…',
          listing: null,
          updatedAt: '2026-09-06T16:00:00.000Z',
        },
        now,
      ),
      false,
    )
  })
})

describe('listingIngestStatusCopy', () => {
  it('says looking then loading then the outcome', () => {
    assert.equal(listingIngestStatusCopy('queued'), 'Looking for a listing…')
    assert.equal(listingIngestStatusCopy('checking-db'), 'Looking for a listing…')
    assert.equal(
      listingIngestStatusCopy('rets-address'),
      'Loading listing from RETS…',
    )
    assert.equal(listingIngestStatusCopy('found', 'Closed'), 'Closed')
    assert.equal(listingIngestStatusCopy('none'), 'No MLS listing in RETS')
  })
})
