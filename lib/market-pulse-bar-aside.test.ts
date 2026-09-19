import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BAR_FILL_DELTA_SPAN_PCT,
  barFillDeltaChipPct,
  barFillDeltaPlacement,
} from './market-pulse-bar-aside'

describe('barFillDeltaPlacement', () => {
  it('moves a chip off a short fill when the track is empty to the right', () => {
    assert.equal(barFillDeltaPlacement(0, 8, '−6'), 'right')
    assert.equal(
      barFillDeltaPlacement(0, BAR_FILL_DELTA_SPAN_PCT - 1, '−6'),
      'right',
    )
  })

  it('keeps the chip on a fill wide enough to hold it', () => {
    assert.equal(barFillDeltaPlacement(0, 60, '−6'), 'center')
    assert.equal(
      barFillDeltaPlacement(0, barFillDeltaChipPct('−6'), '−6'),
      'center',
    )
  })

  it('stays centered when a short fill has no room to the right', () => {
    assert.equal(barFillDeltaPlacement(90, 8, '−6'), 'center')
  })

  it('moves a longer figure off a fill that would still hold −6', () => {
    assert.equal(barFillDeltaPlacement(0, 20, '−0.4 mo'), 'right')
    assert.equal(barFillDeltaPlacement(0, 20, '−6'), 'center')
  })
})
