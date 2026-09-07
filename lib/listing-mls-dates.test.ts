import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listingMlsDates } from './listing-mls-dates'

describe('listingMlsDates', () => {
  it('returns published dates newest first', () => {
    const dates = listingMlsDates({
      OriginalEntryTimestamp: '2025-03-01T12:00:00',
      CloseDate: '2026-06-15',
      StatusChangeTimestamp: '2026-06-20T14:30:00',
      ListingContractDate: '2025-02-20',
    })
    assert.deepEqual(
      dates.map((d) => d.field),
      [
        'StatusChangeTimestamp',
        'CloseDate',
        'OriginalEntryTimestamp',
        'ListingContractDate',
      ],
    )
  })
})
