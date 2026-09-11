import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compareOpenHousePastCountDesc,
  filterOpenHouseFocus,
  isFirstOpenHouse,
  exclusiveOpenHouseFocus,
  listingsWithMostHistoricalShowings,
  mostHistoricalCutoff,
  openHouseFocusEmptyCopy,
} from './open-houses-focus'

const row = (past: number, town = 'Westport') => ({
  pastCount: past,
  weekOpenHouseCount: 1,
  town,
})

describe('first showing', () => {
  it('treats pastCount 0 as a first showing', () => {
    assert.equal(isFirstOpenHouse(row(0)), true)
    assert.equal(isFirstOpenHouse(row(2)), false)
    assert.equal(isFirstOpenHouse({}), true)
  })
})

describe('most historical showings', () => {
  it('uses the 3rd-highest past count as the cutoff and keeps ties', () => {
    assert.equal(mostHistoricalCutoff([10, 8, 8, 5, 1]), 8)
    assert.deepEqual(
      listingsWithMostHistoricalShowings([
        row(10),
        row(8),
        row(8),
        row(5),
        row(1),
      ]).map((r) => r.pastCount),
      [10, 8, 8],
    )
  })

  it('keeps every home tied at the cutoff even if that exceeds 3', () => {
    assert.deepEqual(
      listingsWithMostHistoricalShowings([
        row(9),
        row(4),
        row(4),
        row(4),
      ]).map((r) => r.pastCount),
      [9, 4, 4, 4],
    )
  })

  it('ignores homes with zero past showings', () => {
    assert.equal(mostHistoricalCutoff([0, 0, 5]), 5)
    assert.deepEqual(
      listingsWithMostHistoricalShowings([row(5), row(0), row(0)]).map(
        (r) => r.pastCount,
      ),
      [5],
    )
    assert.deepEqual(listingsWithMostHistoricalShowings([row(0), row(0)]), [])
  })

  it('ranks Most per town, not across the whole page', () => {
    const westport = [row(12, 'Westport'), row(3, 'Westport'), row(1, 'Westport')]
    const wilton = [row(2, 'Wilton'), row(0, 'Wilton')]
    const kept = filterOpenHouseFocus(
      [...westport, ...wilton],
      { most: true, first: false },
      (listing) => listing.town,
    )
    assert.deepEqual(
      kept.map((r) => `${r.town}:${r.pastCount}`).sort(),
      ['Westport:1', 'Westport:12', 'Westport:3', 'Wilton:2'],
    )
  })
})

describe('exclusive Most / First', () => {
  it('turning one on clears the other; turning it off clears both', () => {
    assert.deepEqual(exclusiveOpenHouseFocus('most', true), {
      most: true,
      first: false,
    })
    assert.deepEqual(exclusiveOpenHouseFocus('first', true), {
      most: false,
      first: true,
    })
    assert.deepEqual(exclusiveOpenHouseFocus('most', false), {
      most: false,
      first: false,
    })
  })
})

describe('stacked focus filters', () => {
  it('Most ∩ First is empty because first means zero past', () => {
    const list = [row(4), row(0), row(2)]
    assert.deepEqual(
      filterOpenHouseFocus(list, { most: true, first: true }),
      [],
    )
  })

  it('sorts historical counts descending', () => {
    const list = [row(1), row(8), row(3)]
    assert.deepEqual(
      [...list].sort(compareOpenHousePastCountDesc).map((r) => r.pastCount),
      [8, 3, 1],
    )
  })

  it('names the empty state from the active filters', () => {
    assert.match(
      openHouseFocusEmptyCopy({ focus: { most: true, first: false }, town: 'Westport' }),
      /Westport/,
    )
    assert.match(
      openHouseFocusEmptyCopy({ focus: { most: false, first: true } }),
      /first-time/,
    )
  })
})
