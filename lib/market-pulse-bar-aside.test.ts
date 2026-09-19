import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BAR_FILL_DELTA_SPAN_PCT,
  barFillDeltaPlacement,
} from './market-pulse-bar-aside'

describe('barFillDeltaPlacement', () => {
  it('moves a chip off a short fill when the track is empty to the right', () => {
    assert.equal(barFillDeltaPlacement(0, 8), 'right')
    assert.equal(barFillDeltaPlacement(0, BAR_FILL_DELTA_SPAN_PCT - 1), 'right')
  })

  it('keeps the chip on a fill wide enough to hold it', () => {
    assert.equal(barFillDeltaPlacement(0, 60), 'center')
    assert.equal(barFillDeltaPlacement(0, BAR_FILL_DELTA_SPAN_PCT), 'center')
  })

  it('stays centered when a short fill has no room to the right', () => {
    assert.equal(barFillDeltaPlacement(90, 8), 'center')
  })
})
