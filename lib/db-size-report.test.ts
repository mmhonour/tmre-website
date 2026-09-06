import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  alwaysOnCosts,
  alwaysOnMonthlyUsd,
  decorateChatterRow,
  decorateGrowthRow,
  decorateTableSize,
  LAUNCH_CU_HOUR_USD,
  quoteIdent,
  storageMonthlyUsd,
  GB,
} from './db-size-report-shared'

describe('quoteIdent', () => {
  it('quotes a plain table name', () => {
    assert.equal(quoteIdent('listings'), '"listings"')
  })

  it('rejects interpolation', () => {
    assert.throws(() => quoteIdent('listings; drop table x'), /Unsafe/)
    assert.throws(() => quoteIdent('a-b'), /Unsafe/)
  })
})

describe('decorateGrowthRow', () => {
  it('scales bytes/day from 30-day births and current bytes-per-row', () => {
    const row = decorateGrowthRow({
      table: 'listings',
      column: 'list_date',
      total: 100,
      nulls: 0,
      d1: 2,
      d7: 10,
      d30: 30,
      oldest: null,
      newest: null,
      tableBytes: 10_000,
    })
    assert.equal(row.perDay, 1)
    assert.equal(row.bytesPerDay, 100)
    assert.equal(row.sparsePct, null)
  })

  it('flags sparse birth columns', () => {
    const row = decorateGrowthRow({
      table: 'notes',
      column: 'created_at',
      total: 100,
      nulls: 50,
      d1: 0,
      d7: 0,
      d30: 0,
      oldest: null,
      newest: null,
      tableBytes: 1000,
    })
    assert.equal(row.sparsePct, 50)
  })
})

describe('decorateChatterRow', () => {
  it('withholds per-day rates under one hour of uptime', () => {
    const row = decorateChatterRow(
      { calls: 120, rows: 0, totalMs: 10, query: 'SELECT 1' },
      600,
      false,
    )
    assert.equal(row.callsPerDay, null)
    assert.equal(row.everyLabel, '—')
  })

  it('reports gap and daily rate once the window is long enough', () => {
    const row = decorateChatterRow(
      { calls: 7200, rows: 0, totalMs: 10, query: 'SELECT 1' },
      7200,
      true,
    )
    assert.equal(row.callsPerDay, 86400)
    assert.equal(row.everyLabel, '1.0s')
  })
})

describe('storage and always-on dollars', () => {
  it('prices 1 GB of storage at the Neon monthly rate', () => {
    assert.equal(storageMonthlyUsd(GB), 0.35)
  })

  it('prices a 1 CU Launch compute across 730 hours', () => {
    assert.equal(alwaysOnMonthlyUsd(1, LAUNCH_CU_HOUR_USD), 730 * 0.106)
    const costs = alwaysOnCosts()
    assert.equal(costs[0]?.cu, 1)
    assert.equal(costs[1]?.cu, 2)
    assert.equal(costs[2]?.cu, 4)
  })
})

describe('decorateTableSize', () => {
  it('fills display labels from byte counts', () => {
    const row = decorateTableSize({
      table: 'listings',
      rows: 10,
      total: 2048,
      heap: 1024,
      toast: 512,
      indexes: 512,
    })
    assert.equal(row.totalLabel, '2.0 KB')
    assert.equal(row.heapLabel, '1.0 KB')
  })
})
