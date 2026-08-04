/** Client-safe tab-kit role → style assignments. */

import {
  ADMIN_TAB_KIT,
  type AdminTabKitId,
} from '@/lib/admin-tab-kit'

/**
 * Each catalog entry is a surface role (where that look is used).
 * Assignment maps role → which kit id’s visual to apply.
 * Default is identity (role uses its own style).
 */
export type TabKitAssignments = Record<string, AdminTabKitId>

export function defaultTabKitAssignments(): TabKitAssignments {
  const out: TabKitAssignments = {}
  for (const row of ADMIN_TAB_KIT) {
    out[row.id] = row.id
  }
  return out
}

export function isAdminTabKitId(value: string): value is AdminTabKitId {
  return ADMIN_TAB_KIT.some((row) => row.id === value)
}

export function mergeTabKitAssignments(raw: unknown): TabKitAssignments {
  const defaults = defaultTabKitAssignments()
  if (!raw || typeof raw !== 'object') return defaults
  const next = { ...defaults }
  for (const [role, kitId] of Object.entries(raw as Record<string, unknown>)) {
    if (!(role in defaults)) continue
    if (typeof kitId === 'string' && isAdminTabKitId(kitId)) {
      next[role] = kitId
    }
  }
  return next
}

/** Resolve which kit entry a surface role should render as. */
export function resolveTabKitId(
  roleId: string,
  assignments: TabKitAssignments = defaultTabKitAssignments(),
): AdminTabKitId {
  const mapped = assignments[roleId]
  if (mapped && isAdminTabKitId(mapped)) return mapped
  if (isAdminTabKitId(roleId)) return roleId
  return ADMIN_TAB_KIT[0]!.id
}
