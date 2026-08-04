/**
 * Map Admin tab-kit catalog IDs → filter-pill class recipes.
 * Used so Assignments remaps paint live surfaces (not only the Admin preview).
 */

import type { AdminTabKitId } from '@/lib/admin-tab-kit'
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillIndependentButtonClass,
  filterPillIndependentContainerClass,
  filterPillSeparatorClass,
  type FilterPillSize,
  type FilterPillTheme,
} from '@/lib/filter-pill-styles'
import {
  resolveTabKitId,
  type TabKitAssignments,
} from '@/lib/tab-kit-assignments-shared'

export type TabKitSegmentedRecipe = {
  size: FilterPillSize
  theme: FilterPillTheme
  bordered: boolean
  independent: boolean
  /** When true, sibling group separators should use separatorClass(). */
  withSep: boolean
}

const SEGMENTED_RECIPES: Partial<Record<AdminTabKitId, TabKitSegmentedRecipe>> =
  {
    'pill-seg-dark-default': {
      size: 'default',
      theme: 'dark',
      bordered: true,
      independent: false,
      withSep: false,
    },
    'pill-seg-dark-compact': {
      size: 'compact',
      theme: 'dark',
      bordered: true,
      independent: false,
      withSep: false,
    },
    'pill-seg-light-default': {
      size: 'default',
      theme: 'light',
      bordered: true,
      independent: false,
      withSep: false,
    },
    'pill-seg-light-compact': {
      size: 'compact',
      theme: 'light',
      bordered: true,
      independent: false,
      withSep: false,
    },
    'pill-seg-dark-compact-sep': {
      size: 'compact',
      theme: 'dark',
      bordered: true,
      independent: false,
      withSep: true,
    },
    'pill-seg-unbordered-compact': {
      size: 'compact',
      theme: 'dark',
      bordered: false,
      independent: false,
      withSep: false,
    },
    'pill-ind-dark-compact': {
      size: 'compact',
      theme: 'dark',
      bordered: true,
      independent: true,
      withSep: false,
    },
    'pill-ind-light-compact': {
      size: 'compact',
      theme: 'light',
      bordered: true,
      independent: true,
      withSep: false,
    },
    'status-deal-board': {
      size: 'compact',
      theme: 'dark',
      bordered: true,
      independent: false,
      withSep: false,
    },
  }

/** Recipe for a catalog kit, or null when the kit is not a segmented/independent pill bar. */
export function segmentedRecipeForKitId(
  kitId: AdminTabKitId,
): TabKitSegmentedRecipe | null {
  return SEGMENTED_RECIPES[kitId] ?? null
}

/**
 * Resolve surface role → recipe. Cross-family remaps (e.g. underline) fall back
 * to the role’s own identity recipe when the target kit has no segmented recipe.
 */
export function segmentedRecipeForRole(
  roleId: AdminTabKitId,
  assignments: TabKitAssignments,
): TabKitSegmentedRecipe {
  const resolved = resolveTabKitId(roleId, assignments)
  const fromTarget = segmentedRecipeForKitId(resolved)
  if (fromTarget) return fromTarget
  const identity = segmentedRecipeForKitId(roleId)
  if (identity) return identity
  return {
    size: 'compact',
    theme: 'dark',
    bordered: true,
    independent: false,
    withSep: false,
  }
}

export type TabKitSegmentedClasses = TabKitSegmentedRecipe & {
  containerClass: (options?: { wrap?: boolean }) => string
  buttonClass: (active: boolean) => string
  separatorClass: () => string
}

export function segmentedClassesForRole(
  roleId: AdminTabKitId,
  assignments: TabKitAssignments,
): TabKitSegmentedClasses {
  const recipe = segmentedRecipeForRole(roleId, assignments)
  return {
    ...recipe,
    containerClass: (options) => {
      if (recipe.independent) {
        return filterPillIndependentContainerClass(recipe.size)
      }
      return filterPillContainerClass(recipe.size, {
        wrap: options?.wrap,
        bordered: recipe.bordered,
        theme: recipe.theme,
      })
    },
    buttonClass: (active) =>
      recipe.independent
        ? filterPillIndependentButtonClass(active, recipe.size, recipe.theme)
        : filterPillButtonClass(active, recipe.size, recipe.theme),
    separatorClass: () =>
      filterPillSeparatorClass(recipe.size, recipe.theme),
  }
}
