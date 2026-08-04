/** Browser event so Communications ↔ Sync Dashboard stay aligned after schedule edits. */

export const TMRE_SYNC_SCHEDULE_CHANGED = 'tmre-sync-schedule-changed'

export type TmreSyncScheduleChangedDetail = {
  source: 'sync-dashboard' | 'market-digest' | 'other'
}

export function dispatchSyncScheduleChanged(
  source: TmreSyncScheduleChangedDetail['source'] = 'other',
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<TmreSyncScheduleChangedDetail>(TMRE_SYNC_SCHEDULE_CHANGED, {
      detail: { source },
    }),
  )
}
