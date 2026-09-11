import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compareOpenHouseWeekCountDesc,
  filterOpenHouseFocus,
  isFirstOpenHouse,
  isMostOpenHouses,
  listingMatchesOpenHouseFocus,
  openHouseFocusEmptyCopy,
} from './open-houses-focus'

const row = (past: number, week: number) => ({
  pastCount: past,
  weekOpenHouseCount: week,
})

describe('open house focus filters', () => {
  it('treats pastCount 0 as a first showing', () => {
    assert.equal(isFirstOpenHouse(row(0, 1)), true)
    assert.equal(isFirstOpenHouse(row(2, 1)), false)
    assert.equal(isFirstOpenHouse({}), true)
  })

  it('treats 2+ this week as most open houses', () => {
    assert.equal(isMostOpenHouses(row(0, 1)), false)
    assert.equal(isMostOpenHouses(row(0, 2)), true)
    assert.equal(isMostOpenHouses(row(4, 3)), true)
  })

  it('stacks most and first independently', () => {
    const sea = row(1, 3)
    const debut = row(0, 1)
    const both = row(0, 2)
    const neither = row(2, 1)
    assert.equal(listingMatchesOpenHouseFocus(sea, { most: true, first: false }), true)
    assert.equal(listingMatchesOpenHouseFocus(debut, { most: false, first: true }), true)
    assert.equal(listingMatchesOpenHouseFocus(both, { most: true, first: true }), true)
    assert.equal(listingMatchesOpenHouseFocus(neither, { most: true, first: true }), false)
    assert.deepEqual(
      filterOpenHouseFocus([sea, debut, both, neither], { most: true, first: true }),
      [both],
    )
  })

  it('sorts busiest week counts first', () => {
    const list = [row(0, 1), row(0, 3), row(1, 2)]
    assert.deepEqual(
      [...list].sort(compareOpenHouseWeekCountDesc).map((r) => r.weekOpenHouseCount),
      [3, 2, 1],
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
