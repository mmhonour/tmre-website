/**
 * Run: npx tsx scripts/verify-sync-take-hold.mjs
 */
import assert from 'node:assert/strict'
import { nextPracticalTakeHoldIso } from '../lib/sync-next-override-shared.ts'

const now = new Date('2026-07-27T20:17:00.000Z') // 4:17 PM EDT

const incr = nextPracticalTakeHoldIso(
  'incremental',
  '2026-07-27T20:17:00.000Z',
  now,
)
assert.ok(incr)
const incrDate = new Date(incr)
assert.equal(incrDate.getUTCMinutes() % 30, 0, `expected half-hour, got ${incr}`)
assert.ok(incrDate.getTime() >= now.getTime())

const pastDue = nextPracticalTakeHoldIso(
  'incremental',
  '2026-07-27T19:00:00.000Z',
  now,
)
assert.ok(pastDue)
assert.ok(new Date(pastDue).getTime() >= now.getTime())

console.log('OK — practical take-hold snaps Incremental to :00/:30')
