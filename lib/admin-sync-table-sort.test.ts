import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyFrozenAdminSyncRowOrder,
  compareAdminSyncRowSortMeta,
  compareNullableMs,
  nextAdminSyncColumnSort,
  snapshotAdminSyncSortIds,
  type AdminSyncRowSortMeta,
  type AdminSyncSortableRow,
} from './admin-sync-table-sort'
import { frequencySortRank } from './sync-schedule-config-shared'

describe('frequencySortRank', () => {
  it('orders by duration, not label', () => {
    const ids = ['weekly', '15m', 'monthly', '2h', 'daily', '30m'] as const
    const sorted = [...ids].sort(
      (a, b) => frequencySortRank(a) - frequencySortRank(b),
    )
    assert.deepEqual(sorted, ['15m', '30m', '2h', 'daily', 'weekly', 'monthly'])
  })

  it('puts missing frequency last', () => {
    assert.equal(frequencySortRank(undefined) > frequencySortRank('event'), true)
  })

  it('keeps 2 hours before Daily (interval vs calendar)', () => {
    assert.equal(frequencySortRank('2h') < frequencySortRank('daily'), true)
    assert.equal(frequencySortRank('16h') < frequencySortRank('daily'), true)
  })
})

describe('nextAdminSyncColumnSort', () => {
  it('starts frequency, next, and order ascending', () => {
    assert.deepEqual(nextAdminSyncColumnSort(null, 'asc', 'frequency'), {
      key: 'frequency',
      dir: 'asc',
    })
    assert.deepEqual(nextAdminSyncColumnSort(null, 'asc', 'next'), {
      key: 'next',
      dir: 'asc',
    })
    assert.deepEqual(nextAdminSyncColumnSort(null, 'asc', 'order'), {
      key: 'order',
      dir: 'asc',
    })
  })

  it('starts start and end descending (newest first)', () => {
    assert.deepEqual(nextAdminSyncColumnSort(null, 'asc', 'start'), {
      key: 'start',
      dir: 'desc',
    })
  })

  it('toggles the same column', () => {
    assert.deepEqual(nextAdminSyncColumnSort('end', 'desc', 'end'), {
      key: 'end',
      dir: 'asc',
    })
  })
})

describe('compareNullableMs', () => {
  it('sorts times with nulls last', () => {
    const rows = [1, null, 9, 3]
    const desc = [...rows].sort((a, b) => compareNullableMs(a, b, 'desc'))
    assert.deepEqual(desc, [9, 3, 1, null])
    const asc = [...rows].sort((a, b) => compareNullableMs(a, b, 'asc'))
    assert.deepEqual(asc, [1, 3, 9, null])
  })
})

describe('compareAdminSyncRowSortMeta', () => {
  const a: AdminSyncRowSortMeta = {
    frequency: 'weekly',
    startMs: 100,
    endMs: 200,
    nextMs: 400,
    order: 7,
  }
  const b: AdminSyncRowSortMeta = {
    frequency: '15m',
    startMs: 300,
    endMs: 150,
    nextMs: 350,
    order: 2,
  }

  it('sorts frequency by duration', () => {
    assert.equal(compareAdminSyncRowSortMeta(a, b, 'frequency', 'asc') > 0, true)
    assert.equal(compareAdminSyncRowSortMeta(a, b, 'frequency', 'desc') < 0, true)
  })

  it('sorts next by time', () => {
    assert.equal(compareAdminSyncRowSortMeta(a, b, 'next', 'asc') > 0, true)
  })

  it('sorts order numerically', () => {
    assert.equal(compareAdminSyncRowSortMeta(a, b, 'order', 'asc') > 0, true)
    assert.equal(compareAdminSyncRowSortMeta(a, b, 'order', 'desc') < 0, true)
  })
})

describe('snapshotAdminSyncSortIds', () => {
  it('freezes click-time order so later edits do not reshuffle', () => {
    const rows: AdminSyncSortableRow[] = [
      {
        id: 'weekly',
        frequency: 'weekly',
        startMs: 1,
        endMs: 2,
        nextMs: 3,
        order: 1,
      },
      {
        id: 'fast',
        frequency: '15m',
        startMs: 4,
        endMs: 5,
        nextMs: 6,
        order: 2,
      },
    ]
    const frozen = snapshotAdminSyncSortIds(rows, 'frequency', 'asc')
    assert.deepEqual(frozen, ['fast', 'weekly'])

    const edited = rows.map((row) =>
      row.id === 'fast' ? { ...row, frequency: 'monthly' as const } : row,
    )
    const live = snapshotAdminSyncSortIds(edited, 'frequency', 'asc')
    assert.deepEqual(live, ['weekly', 'fast'])
    assert.deepEqual(
      applyFrozenAdminSyncRowOrder(edited, frozen).map((row) => row.id),
      ['fast', 'weekly'],
    )
  })
})
