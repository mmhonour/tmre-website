import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractClientIp,
  isPrivateOrLocalIp,
  parseIpapiBody,
  peekIpapiLookup,
  rememberIpapiLookup,
} from './ipapi-geo'

describe('isPrivateOrLocalIp', () => {
  it('rejects loopback and RFC1918', () => {
    assert.equal(isPrivateOrLocalIp(null), true)
    assert.equal(isPrivateOrLocalIp('127.0.0.1'), true)
    assert.equal(isPrivateOrLocalIp('10.0.0.8'), true)
    assert.equal(isPrivateOrLocalIp('192.168.1.4'), true)
    assert.equal(isPrivateOrLocalIp('172.16.0.2'), true)
    assert.equal(isPrivateOrLocalIp('::1'), true)
  })
  it('allows a public IPv4', () => {
    assert.equal(isPrivateOrLocalIp('8.8.8.8'), false)
    assert.equal(isPrivateOrLocalIp('73.162.10.4'), false)
    assert.equal(isPrivateOrLocalIp('172.15.0.1'), false)
  })
})

describe('extractClientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const headers = new Headers({
      'x-forwarded-for': '73.162.10.4, 10.0.0.1',
    })
    assert.equal(extractClientIp(headers), '73.162.10.4')
  })
})

describe('parseIpapiBody', () => {
  it('reads city, postal, and coordinates', () => {
    const geo = parseIpapiBody({
      city: 'Westport',
      region: 'Connecticut',
      postal: '06880',
      country_name: 'United States',
      org: 'Optimum',
      latitude: 41.14,
      longitude: -73.35,
    })
    assert.equal(geo.city, 'Westport')
    assert.equal(geo.postal, '06880')
    assert.equal(geo.latitude, 41.14)
  })
  it('keeps the first five digits of a ZIP+4 postal', () => {
    const geo = parseIpapiBody({ postal: '06880-1234' })
    assert.equal(geo.postal, '06880')
  })
  it('turns a rate-limit payload into empty geo', () => {
    const geo = parseIpapiBody({
      error: true,
      reason: 'RateLimited',
      message: 'Quota exceeded',
    })
    assert.equal(geo.postal, null)
    assert.equal(geo.city, null)
  })
})

describe('rememberIpapiLookup', () => {
  it('returns the stored lookup from memory', () => {
    rememberIpapiLookup('203.0.113.9', {
      city: 'Norwalk',
      region: 'Connecticut',
      postal: '06854',
      country: 'United States',
      org: 'Frontier',
      latitude: 41.11,
      longitude: -73.41,
    })
    assert.equal(peekIpapiLookup('203.0.113.9')?.postal, '06854')
  })
})
