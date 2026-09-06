import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compareAddressLabels,
  streetNameToSlug,
  visionParcelFindHref,
  visionStreetPageHref,
} from './vision-streets-page'

describe('visionStreetPageHref', () => {
  it('builds the official street path and optional house hash', () => {
    assert.equal(
      visionStreetPageHref('Westport', 'SEA SPRAY RD'),
      '/streets/westport/sea-spray-rd',
    )
    assert.equal(
      visionStreetPageHref('Westport', 'SEA SPRAY RD', '3564'),
      '/streets/westport/sea-spray-rd#pid-3564',
    )
  })
})

describe('visionParcelFindHref', () => {
  it('opens the Westport Find parcel page for a Vision PID', () => {
    assert.equal(
      visionParcelFindHref('Westport', '3564', '16 SEA SPRAY RD'),
      '/find/westport/3564',
    )
  })

  it('falls back to Find search when the town has no parcel route', () => {
    assert.equal(
      visionParcelFindHref('Darien', '12', '5 Locust Ln'),
      '/find?q=5%20Locust%20Ln',
    )
  })
})

describe('streetNameToSlug', () => {
  it('slugifies assessor street names', () => {
    assert.equal(streetNameToSlug('SEA SPRAY RD'), 'sea-spray-rd')
    assert.equal(streetNameToSlug('Locust Ln'), 'locust-ln')
  })
})

describe('compareAddressLabels', () => {
  it('sorts house numbers before labels without a number', () => {
    const labels = ['16 SEA SPRAY RD', '2 SEA SPRAY RD', 'SEA SPRAY RD']
    labels.sort(compareAddressLabels)
    assert.deepEqual(labels, [
      '2 SEA SPRAY RD',
      '16 SEA SPRAY RD',
      'SEA SPRAY RD',
    ])
  })
})
