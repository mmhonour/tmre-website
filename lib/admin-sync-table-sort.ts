import {
  frequencySortRank,
  type SyncScheduleFrequencyId,
} from '@/lib/sync-schedule-config-shared'

export type AdminSyncColumnSortKey = 'frequency' | 'start' | 'end' | 'next'
export type AdminSyncColumnSortDir = 'asc' | 'desc'

export type AdminSyncRowSortMeta = {
  frequency?: SyncScheduleFrequencyId
  startMs: number | null
  endMs: number | null
  nextMs: number | null
}

/** Frequency / Next: shortest or soonest first. Start / End: newest first. */
export function nextAdminSyncColumnSort(
  currentKey: AdminSyncColumnSortKey | null,
  currentDir: AdminSyncColumnSortDir,
  clicked: AdminSyncColumnSortKey,
): { key: AdminSyncColumnSortKey; dir: AdminSyncColumnSortDir } {
  if (currentKey === clicked) {
    return { key: clicked, dir: currentDir === 'asc' ? 'desc' : 'asc' }
  }
  return {
    key: clicked,
    dir: clicked === 'start' || clicked === 'end' ? 'desc' : 'asc',
  }
}

export function compareNullableMs(
  a: number | null,
  b: number | null,
  dir: AdminSyncColumnSortDir,
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a - b : b - a
}

export function compareAdminSyncRowSortMeta(
  a: AdminSyncRowSortMeta,
  b: AdminSyncRowSortMeta,
  key: AdminSyncColumnSortKey,
  dir: AdminSyncColumnSortDir,
): number {
  if (key === 'frequency') {
    const left = frequencySortRank(a.frequency)
    const right = frequencySortRank(b.frequency)
    if (left === right) return 0
    return dir === 'asc' ? left - right : right - left
  }
  if (key === 'start') return compareNullableMs(a.startMs, b.startMs, dir)
  if (key === 'end') return compareNullableMs(a.endMs, b.endMs, dir)
  return compareNullableMs(a.nextMs, b.nextMs, dir)
}
