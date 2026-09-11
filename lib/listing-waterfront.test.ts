import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  waterfrontDescriptionFromRaw,
  waterfrontYnFromRaw,
} from './listing-waterfront'

describe('listing waterfront from MLS raw', () => {
  it('maps DirectWaterfrontYN to Y or N', () => {
    assert.equal(waterfrontYnFromRaw({ DirectWaterfrontYN: '1' }), 'Y')
    assert.equal(waterfrontYnFromRaw({ DirectWaterfrontYN: '0' }), 'N')
    assert.equal(waterfrontYnFromRaw({ DirectWaterfrontYN: 'Y' }), 'Y')
    assert.equal(waterfrontYnFromRaw({}), null)
  })

  it('reads WaterfrontDescription when present', () => {
    assert.equal(
      waterfrontDescriptionFromRaw({
        WaterfrontDescription: 'L. I. Sound Frontage,Walk to Water',
      }),
      'L. I. Sound Frontage,Walk to Water',
    )
    assert.equal(waterfrontDescriptionFromRaw({ WaterfrontDescription: '  ' }), null)
  })
})
