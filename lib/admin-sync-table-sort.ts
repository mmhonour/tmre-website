import {
  frequencySortRank,
  type SyncScheduleFrequencyId,
} from '@/lib/sync-schedule-config-shared'

export type AdminSyncColumnSortKey =
  | 'order'
  | 'frequency'
  | 'start'
  | 'end'
  | 'next'
export type AdminSyncColumnSortDir = 'asc' | 'desc'

export type AdminSyncRowSortMeta = {
  frequency?: SyncScheduleFrequencyId
  startMs: number | null
  endMs: number | null
  nextMs: number | null
  order: number
}

export type AdminSyncSortableRow = { id: string } & AdminSyncRowSortMeta

/** Frequency / Next / Order: low first. Start / End: newest first. */
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
  if (key === 'order') {
    return dir === 'asc' ? a.order - b.order : b.order - a.order
  }
  if (key === 'start') return compareNullableMs(a.startMs, b.startMs, dir)
  if (key === 'end') return compareNullableMs(a.endMs, b.endMs, dir)
  return compareNullableMs(a.nextMs, b.nextMs, dir)
}

/** Snapshot ids at click time so later edits do not reshuffle the table. */
export function snapshotAdminSyncSortIds(
  metas: readonly AdminSyncSortableRow[],
  key: AdminSyncColumnSortKey,
  dir: AdminSyncColumnSortDir,
): string[] {
  return [...metas]
    .sort((a, b) => {
      const cmp = compareAdminSyncRowSortMeta(a, b, key, dir)
      if (cmp !== 0) return cmp
      if (a.order !== b.order) return a.order - b.order
      return a.id.localeCompare(b.id)
    })
    .map((row) => row.id)
}

export function applyFrozenAdminSyncRowOrder<T extends { id: string }>(
  rows: readonly T[],
  frozenIds: readonly string[] | null,
): T[] {
  if (!frozenIds?.length) return [...rows]
  const byId = new Map(rows.map((row) => [row.id, row]))
  const seen = new Set<string>()
  const ordered: T[] = []
  for (const id of frozenIds) {
    const row = byId.get(id)
    if (!row) continue
    ordered.push(row)
    seen.add(id)
  }
  for (const row of rows) {
    if (!seen.has(row.id)) ordered.push(row)
  }
  return ordered
}
