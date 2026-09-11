import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  groupOpenHousesByTownAndDay,
  openHouseDayLabel,
} from './open-houses-groups'
import type { OpenHouseListing } from './open-houses'

function listing(
  city: string,
  zip: string,
  date: string,
  street: string,
): OpenHouseListing {
  const event = {
    id: `${street}-${date}`,
    listingKey: street,
    listingId: street,
    date,
    startDateTime: `${date}T11:00:00`,
    endDateTime: `${date}T13:00:00`,
    type: 'Public',
    comment: null,
  }
  return {
    mlsId: street,
    propertyType: 'Single Family For Sale',
    style: 'Colonial',
    address: {
      street,
      unit: '',
      city,
      state: 'CT',
      postalCode: zip,
      full: `${street}, ${city}, CT ${zip}`,
    },
    price: 1,
    beds: 3,
    baths: 2,
    sqft: 2000,
    yearBuilt: 1990,
    dom: 5,
    photoCount: 0,
    status: 'Active',
    ownerName: null,
    openHouses: [event],
    nextOpenHouse: event,
    pastCount: 0,
    upcomingCount: 1,
    weekOpenHouseCount: 1,
  }
}

describe('openHouseDayLabel', () => {
  it('uses Today and Tomorrow, then the weekday', () => {
    assert.equal(openHouseDayLabel('2026-09-10', '2026-09-10'), 'Today')
    assert.equal(openHouseDayLabel('2026-09-11', '2026-09-10'), 'Tomorrow')
    assert.equal(
      openHouseDayLabel('2026-09-12', '2026-09-10'),
      'Saturday, Sep 12',
    )
  })
})

describe('groupOpenHousesByTownAndDay', () => {
  it('groups by town then day and skips empty days', () => {
    const rows = [
      listing('Westport', '06880', '2026-09-12', '1 Main'),
      listing('Westport', '06880', '2026-09-10', '2 Main'),
      listing('Wilton', '06897', '2026-09-10', '3 Ridge'),
    ]
    const groups = groupOpenHousesByTownAndDay(rows, {
      today: '2026-09-10',
      townOrder: ['Westport', 'Wilton'],
    })
    assert.deepEqual(
      groups.map((g) => g.town),
      ['Westport', 'Wilton'],
    )
    assert.deepEqual(
      groups[0]?.days.map((d) => d.label),
      ['Today', 'Saturday, Sep 12'],
    )
    assert.equal(groups[0]?.days.length, 2)
    assert.equal(groups[0]?.propertyCount, 2)
    assert.equal(groups[1]?.days[0]?.label, 'Today')
    assert.equal(groups[1]?.propertyCount, 1)
  })

  it('counts a home once even when it has several open houses this week', () => {
    const first = listing('Westport', '06880', '2026-09-10', '16 Sea Spray')
    const extra = {
      ...first.nextOpenHouse,
      id: 'sat',
      date: '2026-09-12',
      startDateTime: '2026-09-12T11:00:00',
      endDateTime: '2026-09-12T13:00:00',
    }
    const busy = {
      ...first,
      openHouses: [first.nextOpenHouse, extra],
      weekOpenHouseCount: 2,
    }
    const groups = groupOpenHousesByTownAndDay([busy], {
      today: '2026-09-10',
      townOrder: ['Westport'],
    })
    assert.equal(groups[0]?.propertyCount, 1)
    assert.equal(groups[0]?.days[0]?.listings[0]?.weekOpenHouseCount, 2)
  })
})
