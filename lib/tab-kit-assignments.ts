import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  mergeTabKitAssignments,
  type TabKitAssignments,
} from '@/lib/tab-kit-assignments-shared'

export const TAB_KIT_ASSIGNMENTS_KEY = 'tab_kit_assignments'

export type { TabKitAssignments } from '@/lib/tab-kit-assignments-shared'
export {
  defaultTabKitAssignments,
  isAdminTabKitId,
  mergeTabKitAssignments,
  resolveTabKitId,
} from '@/lib/tab-kit-assignments-shared'

function parse(raw: string | null | undefined): TabKitAssignments {
  if (!raw?.trim()) return mergeTabKitAssignments(null)
  try {
    return mergeTabKitAssignments(JSON.parse(raw) as unknown)
  } catch {
    return mergeTabKitAssignments(null)
  }
}

export function readTabKitAssignments(): TabKitAssignments {
  return parse(getSyncMeta(TAB_KIT_ASSIGNMENTS_KEY))
}

export async function readTabKitAssignmentsFresh(): Promise<TabKitAssignments> {
  return parse(await getSyncMetaFresh(TAB_KIT_ASSIGNMENTS_KEY))
}

export async function writeTabKitAssignments(
  assignments: TabKitAssignments,
): Promise<TabKitAssignments> {
  const merged = mergeTabKitAssignments(assignments)
  await setSyncMetaDurable(TAB_KIT_ASSIGNMENTS_KEY, JSON.stringify(merged))
  return merged
}
