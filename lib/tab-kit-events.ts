/** Browser event when Admin saves tab-kit Assignments (live surfaces refetch). */

export const TMRE_TAB_KIT_ASSIGNMENTS_CHANGED =
  'tmre-tab-kit-assignments-changed'

export function dispatchTabKitAssignmentsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TMRE_TAB_KIT_ASSIGNMENTS_CHANGED))
}
