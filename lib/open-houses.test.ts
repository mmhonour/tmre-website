import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addCalendarDays,
  formatOpenHouseHistory,
  formatOpenHouseType,
  formatOpenHouseWeekCount,
  formatOpenHouseWhenShort,
  markOpenHouseUpcoming,
  openHouseHorizonWindow,
  openHouseLookbackWindow,
  openHouseRemainingWeekWindow,
  openHousesPageCacheMatchesWindow,
  openHouseWeekWindow,
  pickNextOpenHouse,
  splitDateWindow,
  type OpenHouseEvent,
} from './open-houses'

describe('splitDateWindow', () => {
  it('splits an inclusive range into 31-day chunks', () => {
    const chunks = splitDateWindow({ start: '2026-01-01', end: '2026-03-15' }, 31)
    assert.deepEqual(chunks, [
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-03-03' },
      { start: '2026-03-04', end: '2026-03-15' },
    ])
  })

  it('returns nothing when start is after end', () => {
    assert.deepEqual(splitDateWindow({ start: '2026-02-01', end: '2026-01-01' }), [])
  })
})

describe('lookback / horizon windows', () => {
  it('lookback ends yesterday and horizon starts today', () => {
    const from = new Date('2026-09-02T16:00:00Z')
    const today = '2026-09-02'
    const lookback = openHouseLookbackWindow(from)
    const horizon = openHouseHorizonWindow(from)
    assert.equal(lookback.end, addCalendarDays(today, -1))
    assert.equal(horizon.start, today)
    assert.ok(lookback.start < lookback.end)
    assert.ok(horizon.end > horizon.start)
  })
})

describe('formatOpenHouseHistory', () => {
  it('uses singular and plural labels', () => {
    assert.equal(formatOpenHouseHistory(1, 1), '1 past · 1 upcoming')
    assert.equal(formatOpenHouseHistory(0, 3), '0 past · 3 upcoming')
  })
})

describe('listing open house rows', () => {
  it('marks upcoming from the server today stamp', () => {
    const event = {
      id: '1',
      listingKey: 'k',
      listingId: 'MLS-1',
      date: '2026-09-12',
      startDateTime: '2026-09-12T11:00:00',
      endDateTime: '2026-09-12T13:00:00',
      type: 'O',
      comment: null,
    }
    assert.equal(markOpenHouseUpcoming(event, '2026-09-11').upcoming, true)
    assert.equal(markOpenHouseUpcoming(event, '2026-09-13').upcoming, false)
    assert.equal(formatOpenHouseType('O'), 'Public')
    assert.equal(formatOpenHouseType('Broker'), 'Broker')
  })
})

describe('openHouseWeekWindow', () => {
  it('uses Monday–Sunday of the ET week that contains today', () => {
    assert.deepEqual(openHouseWeekWindow(new Date('2026-09-10T20:00:00Z')), {
      start: '2026-09-07',
      end: '2026-09-13',
    })
    assert.deepEqual(openHouseWeekWindow(new Date('2026-09-13T16:00:00Z')), {
      start: '2026-09-07',
      end: '2026-09-13',
    })
    assert.deepEqual(openHouseWeekWindow(new Date('2026-09-14T12:00:00Z')), {
      start: '2026-09-14',
      end: '2026-09-20',
    })
  })
})

describe('openHouseRemainingWeekWindow', () => {
  it('starts today when Monday has already passed', () => {
    assert.deepEqual(
      openHouseRemainingWeekWindow(new Date('2026-09-10T20:00:00Z')),
      { start: '2026-09-10', end: '2026-09-13' },
    )
  })

  it('is the full week on Monday', () => {
    assert.deepEqual(
      openHouseRemainingWeekWindow(new Date('2026-09-14T12:00:00Z')),
      { start: '2026-09-14', end: '2026-09-20' },
    )
  })
})

describe('pickNextOpenHouse', () => {
  const slot = (date: string): OpenHouseEvent => ({
    id: date,
    listingKey: 'k',
    listingId: '1',
    date,
    startDateTime: `${date}T11:00:00`,
    endDateTime: `${date}T13:00:00`,
    type: 'Public',
    comment: null,
  })

  it('keeps today-or-later slots and drops a series that already ended', () => {
    const mon = slot('2026-09-07')
    const sat = slot('2026-09-12')
    assert.equal(pickNextOpenHouse([sat, mon], '2026-09-10')?.date, '2026-09-12')
    assert.equal(pickNextOpenHouse([mon], '2026-09-10'), undefined)
  })
})

describe('formatOpenHouseWeekCount', () => {
  it('uses singular and plural labels', () => {
    assert.equal(formatOpenHouseWeekCount(1), '1 this week')
    assert.equal(formatOpenHouseWeekCount(3), '3 this week')
  })
})

describe('openHousesPageCacheMatchesWindow', () => {
  it('accepts today-through-Sunday and rejects yesterday’s window', () => {
    const window = { start: '2026-09-12', end: '2026-09-13' }
    assert.equal(
      openHousesPageCacheMatchesWindow({ window }, window),
      true,
    )
    assert.equal(
      openHousesPageCacheMatchesWindow(
        { window: { start: '2026-09-11', end: '2026-09-13' } },
        window,
      ),
      false,
    )
    assert.equal(openHousesPageCacheMatchesWindow(null, window), false)
  })
})

describe('formatOpenHouseWhenShort', () => {
  it('uses weekday and times without the month', () => {
    const sat: OpenHouseEvent = {
      id: '1',
      listingKey: 'k',
      listingId: '1',
      date: '2026-09-12',
      startDateTime: '2026-09-12T12:00:00',
      endDateTime: '2026-09-12T14:00:00',
      type: 'Public',
      comment: null,
    }
    assert.equal(formatOpenHouseWhenShort(sat), 'Sat · 12:00 PM–2:00 PM')
  })
})
