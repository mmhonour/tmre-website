import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatVisitorLocation,
  groupVisitorsByZip,
  normalizeVisitorZip,
  visitorIsAdmin,
  visitorZip,
  type VisitorRecord,
} from './visitors-types'

function visitor(partial: Partial<VisitorRecord>): VisitorRecord {
  return {
    vid: partial.vid ?? 'v1',
    firstSeen: partial.firstSeen ?? '2026-09-14T12:00:00.000Z',
    lastSeen: partial.lastSeen ?? '2026-09-18T12:00:00.000Z',
    pageviews: partial.pageviews ?? 3,
    ip: partial.ip ?? '203.0.113.10',
    geo: partial.geo ?? {
      city: null,
      region: null,
      postal: null,
      country: null,
      org: null,
    },
    pages: partial.pages ?? [],
    ...partial,
  }
}

describe('normalizeVisitorZip', () => {
  it('keeps a 5-digit ZIP', () => {
    assert.equal(normalizeVisitorZip('06880'), '06880')
  })
  it('rejects short or letter values', () => {
    assert.equal(normalizeVisitorZip('0688'), null)
    assert.equal(normalizeVisitorZip('westport'), null)
  })
})

describe('visitorZip / formatVisitorLocation', () => {
  it('prefers the stored header ZIP over IP postal', () => {
    const row = visitor({
      zip: '06880',
      geo: {
        city: 'New York',
        region: 'New York',
        postal: '10001',
        country: 'United States',
        org: 'Example ISP',
      },
    })
    assert.equal(visitorZip(row), '06880')
    assert.equal(formatVisitorLocation(row), 'Westport, CT 06880')
  })

  it('falls back to IP postal when zip is empty', () => {
    const row = visitor({
      zip: null,
      geo: {
        city: 'Westport',
        region: 'Connecticut',
        postal: '06880',
        country: 'United States',
        org: 'Optimum',
      },
    })
    assert.equal(visitorZip(row), '06880')
    assert.equal(formatVisitorLocation(row), 'Westport, CT 06880')
  })

  it('keeps city/region when the ZIP is outside TMRE towns', () => {
    const row = visitor({
      zip: '10001',
      geo: {
        city: 'New York',
        region: 'New York',
        postal: '10001',
        country: 'United States',
        org: 'Verizon',
      },
    })
    assert.equal(formatVisitorLocation(row), 'New York, New York, 10001')
  })
})

describe('groupVisitorsByZip', () => {
  it('buckets by ZIP and sorts unknown last', () => {
    const groups = groupVisitorsByZip([
      visitor({
        vid: 'a',
        zip: '06880',
        pageviews: 4,
        lastSeen: '2026-09-18T15:00:00.000Z',
      }),
      visitor({
        vid: 'b',
        zip: '06880',
        pageviews: 2,
        lastSeen: '2026-09-18T14:00:00.000Z',
      }),
      visitor({
        vid: 'c',
        zip: null,
        pageviews: 9,
        lastSeen: '2026-09-18T16:00:00.000Z',
      }),
    ])
    assert.equal(groups[0]?.zip, '06880')
    assert.equal(groups[0]?.visitorCount, 2)
    assert.equal(groups[0]?.pageviews, 6)
    assert.equal(groups[1]?.zip, 'Unknown ZIP')
  })
})

describe('visitorIsAdmin', () => {
  it('is true only when the site-pass flag is set', () => {
    assert.equal(visitorIsAdmin(visitor({})), false)
    assert.equal(visitorIsAdmin(visitor({ isAdmin: true })), true)
  })
})
